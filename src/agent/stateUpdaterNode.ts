import type { BaseMessage, ToolMessage } from '@langchain/core/messages';
import type { CommercePort, DeliveryResolutionContext } from '@/core/ports/commerce.port.js';
import { normalizedToUICartItem } from '@/adapters/ui-mappers.js';
import { logger } from '@/lib/logger.js';
import type { StateType } from './state.js';

interface ToolCallLike {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

function getToolCalls(msg: BaseMessage | undefined): ToolCallLike[] {
  const calls = (msg as unknown as { tool_calls?: ToolCallLike[] } | undefined)?.tool_calls;
  return Array.isArray(calls) ? calls : [];
}

/** Scans backward for the most recent AIMessage — the one whose tool_calls the trailing ToolMessages answer. */
function findLastAIMessageIndex(messages: BaseMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]._getType() === 'ai') return i;
  }
  return -1;
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Runs after the ToolNode. Refreshes cartSnapshot unconditionally; extracts
 * deliveryContext.city and customerName from this turn's tool calls when
 * present. Never throws — a state-update failure must not crash the graph
 * mid-conversation, so each piece of work is independently try/caught and
 * simply omitted from the returned partial state on failure.
 */
export async function stateUpdaterNode(
  state: StateType,
  adapter: CommercePort,
): Promise<Partial<StateType>> {
  const updates: Partial<StateType> = {};

  const aiIndex = findLastAIMessageIndex(state.messages);
  const aiMessage = aiIndex >= 0 ? state.messages[aiIndex] : undefined;
  const toolCalls = getToolCalls(aiMessage);

  // Always: refresh cartSnapshot from the adapter.
  try {
    const cart = await adapter.getCart();
    updates.cartSnapshot = cart.items.map(normalizedToUICartItem);
  } catch (err) {
    logger.error({ err: toMessage(err) }, 'stateUpdaterNode: getCart failed');
  }

  // deliveryContext.city — strong vs. weak signal, not in-batch position
  // preference. The graph loops agent->tools->stateUpdater once per tool-call
  // round, so listDeliveryCities and checkDelivery often land in *different*
  // rounds (resolve first, check later) — this node only ever sees one
  // round's tool_calls at a time, so a naive "prefer listCall this round"
  // check fails once checkDelivery(id-form) runs alone in a later round.
  // Read from tool_call ARGS, not the tool's result text, so it updates even
  // when the live API rejects the city format.
  try {
    const listCall = toolCalls.find((c) => c.name === 'listDeliveryCities');
    const checkCall = toolCalls.find((c) => c.name === 'checkDelivery');

    // Strong signal: listDeliveryCities.query is fresh user-stated intent.
    // Always overwrites — including when the user changes destination
    // mid-conversation ("actually send to Kandy").
    const strongCity = (listCall?.args as { query?: unknown })?.query;
    if (typeof strongCity === 'string' && strongCity.length > 0) {
      updates.deliveryContext = {
        city: strongCity,
        date: state.deliveryContext.date,
        resolvedCity: state.deliveryContext.resolvedCity,
        ambiguous: state.deliveryContext.ambiguous,
        alternateZones: state.deliveryContext.alternateZones,
        lastResolutionReason: state.deliveryContext.lastResolutionReason,
      };
    } else if (checkCall && !state.deliveryContext.city) {
      // Weak signal: checkDelivery.city is the resolved id-form. Only write
      // if no city is set yet — preserves the human form set in an earlier round.
      const weakCity = (checkCall.args as { city?: unknown }).city;
      if (typeof weakCity === 'string' && weakCity.length > 0) {
        updates.deliveryContext = {
          city: weakCity,
          date: state.deliveryContext.date,
          resolvedCity: state.deliveryContext.resolvedCity,
          ambiguous: state.deliveryContext.ambiguous,
          alternateZones: state.deliveryContext.alternateZones,
          lastResolutionReason: state.deliveryContext.lastResolutionReason,
        };
      }
    }
  } catch (err) {
    logger.error({ err: toMessage(err) }, 'stateUpdaterNode: deliveryContext extraction failed');
  }

  // deliveryContext resolution metadata — read from the most recent
  // checkDelivery ToolMessage's artifact (responseFormat: 'content_and_artifact'
  // on the checkDelivery tool). This is the actual resolved value the adapter
  // computed, distinct from the strong/weak signal above (which only reflects
  // what the LLM passed as args). Additive: only overwrites the resolution
  // fields, preserving whatever city/date the block above already set.
  try {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i];
      if (m._getType() !== 'tool') continue;
      const tm = m as ToolMessage;
      if (tm.name !== 'checkDelivery') continue;

      const artifact = tm.artifact as { resolutionContext?: DeliveryResolutionContext | null } | undefined;

      if (artifact?.resolutionContext) {
        const ctx = artifact.resolutionContext;
        const existingCity = updates.deliveryContext?.city ?? state.deliveryContext.city;
        const existingDate = updates.deliveryContext?.date ?? state.deliveryContext.date;

        updates.deliveryContext = {
          city: existingCity ?? ctx.requestedCity,
          date: existingDate ?? ctx.resolvedDate,
          resolvedCity: ctx.resolvedAs,
          ambiguous: ctx.ambiguous,
          alternateZones: ctx.alternateNames,
          lastResolutionReason: ctx.reason,
        };
      }
      break; // only the most recent checkDelivery matters
    }
  } catch (err) {
    logger.error({ err: toMessage(err) }, 'stateUpdaterNode: artifact extraction failed');
  }

  // customerName — rememberCustomerFact is designed to never throw into the
  // graph (silent degrade by design), so a tool_call appearing in this turn IS
  // evidence the call ran. Read args directly rather than scanning ToolMessages —
  // this also correctly handles multi-call turns (e.g. name + preferredCity in
  // one user message), regardless of call order.
  try {
    const nameCall = toolCalls.find(
      (call) =>
        call.name === 'rememberCustomerFact' &&
        (call.args as { key?: unknown }).key === 'name',
    );
    if (nameCall) {
      const args = nameCall.args as { value?: unknown };
      if (typeof args.value === 'string' && args.value.length > 0) {
        updates.customerName = args.value;
      }
    }
  } catch (err) {
    logger.error({ err: toMessage(err) }, 'stateUpdaterNode: customerName extraction failed');
  }

  return updates;
}
