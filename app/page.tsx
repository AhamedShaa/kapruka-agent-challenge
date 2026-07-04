'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

import type { RenderEvent, UICartItem, UIProduct } from '@/agent/state.js';
import ChatInput from '@/components/chat/ChatInput.js';
import TypingIndicator from '@/components/chat/TypingIndicator.js';
import RenderEventView from '@/components/chat/RenderEventView.js';
import UserMessage from '@/components/chat/UserMessage.js';
import AgentMessage from '@/components/chat/AgentMessage.js';
import TopBar from '@/components/layout/TopBar.js';
import Sidebar from '@/components/layout/Sidebar.js';
import ProductDetailDrawer from '@/components/products/ProductDetailDrawer.js';
import CartDrawer from '@/components/cart/CartDrawer.js';
import { computeIncrementalPlan } from '@/lib/displayPlan.js';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  renderEvents?: RenderEvent[];
  isStreaming?: boolean;
}

type SseFrame =
  | { type: 'token'; delta: string }
  | { type: 'render'; event: RenderEvent }
  | { type: 'done' }
  | { type: 'error'; message: string };

function isSseFrame(v: unknown): v is SseFrame {
  return typeof v === 'object' && v !== null && 'type' in v;
}

function uuid(): string {
  return crypto.randomUUID();
}

// Forces every markdown link (product URLs, checkout links the assistant
// might reference) to open in a new tab — same-tab navigation would abandon
// the user's cart/conversation mid-chat.
const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-purple-600 dark:text-[#B49FDD] underline hover:text-purple-700 dark:hover:text-[#B49FDD]"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0">{children}</ol>,
};

export default function Home(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cartItems, setCartItems] = useState<UICartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // Language is autodetected by the system prompt; locale is fixed for API calls
  const locale = 'en';
  const [selectedProduct, setSelectedProduct] = useState<UIProduct | null>(null);
  const [browserId, setBrowserId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isHydrating, setIsHydrating] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Client-side map of productId → image_url. The server cart never carries
  // images, so we maintain this ref and enrich cart items before rendering.
  const imageMapRef = useRef<Record<string, string>>({});

  useEffect(() => {
    // Persistent browser identity — survives page refresh, cleared in incognito
    const storedBrowser = window.localStorage.getItem('kapruka_browser_id');
    if (storedBrowser) {
      setBrowserId(storedBrowser);
    } else {
      const id = uuid();
      window.localStorage.setItem('kapruka_browser_id', id);
      setBrowserId(id);
    }

    // Persistent session/thread — reusing the same thread_id resumes the
    // LangGraph conversation from the SQLite checkpointer across page refreshes
    // and server restarts. A new UUID is only generated on the first ever visit
    // (or after the user clears localStorage).
    const storedSession = window.localStorage.getItem('kasun_session_id');
    if (storedSession) {
      setSessionId(storedSession);
    } else {
      const id = uuid();
      window.localStorage.setItem('kasun_session_id', id);
      setSessionId(id);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // §20 — hydrate chat history + cart from server state on mount.
  // Runs once when sessionId is resolved from localStorage.
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    Promise.all([
      fetch(`/api/session/history?sessionId=${encodeURIComponent(sessionId)}`).then(
        (r) => r.json() as Promise<{ ok: boolean; messages?: Message[] }>,
      ),
      fetch('/api/cart/snapshot').then(
        (r) => r.json() as Promise<{ ok: boolean; items?: UICartItem[]; total?: number }>,
      ),
    ])
      .then(([historyData, cartData]) => {
        if (cancelled) return;
        if (historyData.ok && Array.isArray(historyData.messages) && historyData.messages.length > 0) {
          setMessages(historyData.messages);
        }
        if (cartData.ok && Array.isArray(cartData.items)) {
          setCartItems(cartData.items);
          setCartTotal(cartData.total ?? 0);
        }
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setIsHydrating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /** Merge client-known images into a cart item list from the server. */
  function enrichWithImages(items: UICartItem[]): UICartItem[] {
    return items.map((item) => ({
      ...item,
      image_url: imageMapRef.current[item.productId] ?? item.image_url ?? null,
    }));
  }

  /** Shared by both the per-message POST stream and the persistent reactive
   * stream below — applies one SSE frame to the assistant message it belongs to. */
  function applySseFrame(frame: SseFrame, assistantMsgId: string): void {
    if (frame.type === 'token') {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + frame.delta } : m)),
      );
    } else if (frame.type === 'render') {
      const ev = frame.event;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, renderEvents: [...(m.renderEvents ?? []), ev] } : m,
        ),
      );
      if (ev.type === 'CART') {
        setCartItems(enrichWithImages(ev.items));
        setCartTotal(ev.total);
      }

    } else if (frame.type === 'error') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: m.content + `\n\nSomething went wrong: ${frame.message}` }
            : m,
        ),
      );
    } else if (frame.type === 'done') {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m)),
      );
    }
  }

  // Persistent reactive-turn stream — opened once per session, separate from
  // the per-message POST flow below. A server-side debounce timer (triggered
  // by direct cart-mutation clicks) pushes frames into this connection well
  // after any POST has already returned, so it needs its own long-lived
  // delivery channel. Each new sequence of frames (starting at the next
  // 'token' after a 'done') gets its own fresh assistant message bubble,
  // since reactive turns aren't replies to a specific user message.
  useEffect(() => {
    if (!sessionId) return;

    let activeReactiveMsgId: string | null = null;
    const source = new EventSource(`/api/chat/reactive-stream?sessionId=${encodeURIComponent(sessionId)}`);

    source.onmessage = (ev: MessageEvent<string>) => {
      let frame: unknown;
      try {
        frame = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!isSseFrame(frame)) return;

      if (frame.type === 'token' && !activeReactiveMsgId) {
        const id = uuid();
        activeReactiveMsgId = id;
        setMessages((prev) => [...prev, { id, role: 'assistant', content: '', isStreaming: true }]);
      }

      if (activeReactiveMsgId) {
        applySseFrame(frame, activeReactiveMsgId);
        if (frame.type === 'done' || frame.type === 'error') {
          activeReactiveMsgId = null;
        }
      }
    };

    return () => source.close();
  }, [sessionId]);

  async function sendMessage(text: string): Promise<void> {
    if (!text.trim() || isLoading || !sessionId) return;
    setIsLoading(true);

    const userMsgId = uuid();
    const assistantMsgId = uuid();

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId,
          locale,
          browserId,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const payload = chunk.replace(/^data: /, '').trim();
          if (!payload) continue;

          let frame: unknown;
          try {
            frame = JSON.parse(payload);
          } catch {
            continue;
          }
          if (!isSseFrame(frame)) continue;

          applySseFrame(frame, assistantMsgId);
          if (frame.type === 'done') {
            setIsLoading(false);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Something went wrong: ${msg}`, isStreaming: false }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Optimistic-then-reconcile: applies a locally-computed cart update
   * immediately (instant feedback — cart math here is simple and
   * predictable), then overwrites with the server's authoritative response
   * once it arrives. On failure, reverts to the pre-mutation snapshot rather
   * than leaving a guessed state that never got confirmed.
   */
  function mutateCartDirect(
    action: 'add' | 'remove' | 'updateQuantity',
    productId: string,
    optimisticItems: UICartItem[],
    quantity?: number,
  ): void {
    const prevItems = cartItems;
    const prevTotal = cartTotal;

    setCartItems(optimisticItems);
    setCartTotal(optimisticItems.reduce((sum, i) => sum + i.price * i.quantity, 0));

    fetch('/api/cart/direct-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, action, productId, quantity }),
    })
      .then((res) => res.json())
      .then((data: { ok: boolean; items?: UICartItem[]; total?: number }) => {
        if (data.ok && data.items && typeof data.total === 'number') {
          setCartItems(enrichWithImages(data.items));
          setCartTotal(data.total);
        } else {
          setCartItems(prevItems);
          setCartTotal(prevTotal);
        }
      })
      .catch(() => {
        setCartItems(prevItems);
        setCartTotal(prevTotal);
      });
  }

  function handleAddToCart(product: UIProduct, qty = 1): void {
    if (product.image_url) imageMapRef.current[product.id] = product.image_url;
    const existing = cartItems.find((i) => i.productId === product.id);
    const optimisticItems = existing
      ? cartItems.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + qty } : i))
      : [...cartItems, { productId: product.id, name: product.name, price: product.price, quantity: qty, image_url: product.image_url ?? null }];

    mutateCartDirect('add', product.id, optimisticItems, qty);
  }

  function handleQuantityChange(productId: string, newQuantity: number): void {
    if (newQuantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    const optimisticItems = cartItems.map((i) => (i.productId === productId ? { ...i, quantity: newQuantity } : i));
    mutateCartDirect('updateQuantity', productId, optimisticItems, newQuantity);
  }

  function handleRemoveFromCart(productId: string): void {
    const optimisticItems = cartItems.filter((i) => i.productId !== productId);
    mutateCartDirect('remove', productId, optimisticItems);
  }

  function checkoutSingleItem(product: UIProduct, qty: number): void {
    if (product.image_url) imageMapRef.current[product.id] = product.image_url;
    const msg =
      `Buy now: I want to purchase exactly ${qty}× ${product.name} (ID: ${product.id}) ` +
      `for LKR ${product.price.toLocaleString()} each. ` +
      `Please clear my cart, add only this item with quantity ${qty}, ` +
      `then guide me through checkout.`;
    sendMessage(msg).catch(() => null);
  }

  function handleBuyNow(product: UIProduct, qty = 1): void {
    checkoutSingleItem(product, qty);
  }

  function handleViewDetail(product: UIProduct): void {
    // Mutual exclusion: opening product detail closes the cart drawer
    setIsCartOpen(false);
    // Open immediately with the thin shape already in hand (good perceived
    // performance), then replace with the full shape (real description) once
    // the fetch resolves. Search results never carry a description — only
    // getProduct does — so the thin shape alone would show an empty drawer.
    setSelectedProduct(product);

    fetch(`/api/products/${encodeURIComponent(product.id)}`)
      .then((res) => res.json())
      .then((data: { ok: boolean; product?: UIProduct }) => {
        if (data.ok && data.product) {
          const full = data.product as UIProduct;
          if (full.image_url) imageMapRef.current[full.id] = full.image_url;
          setSelectedProduct((current) => (current?.id === product.id ? full : current));
        }
      })
      .catch(() => null);
  }

  const cartCount = cartItems.reduce((n, item) => n + item.quantity, 0);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#17141F]">
      <TopBar
        cartCount={cartCount}
        onCartOpen={() => { setIsCartOpen(true); setSelectedProduct(null); }}
      />

      {/* Below TopBar: sidebar + chat area side-by-side */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Chat column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div
          className="max-w-2xl mx-auto w-full space-y-5"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {isHydrating && (
            <div
              className="space-y-6 mt-6 animate-pulse motion-reduce:animate-none"
              aria-label="Loading conversation…"
              aria-busy={true}
            >
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-[#2A2438] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 bg-gray-200 dark:bg-[#2A2438] rounded w-3/4" />
                  <div className="h-3.5 bg-gray-200 dark:bg-[#2A2438] rounded w-1/2" />
                </div>
              </div>
              <div className="flex justify-end">
                <div className="h-3.5 bg-purple-100 dark:bg-[#2A2438] rounded w-1/3" />
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-[#2A2438] flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 bg-gray-200 dark:bg-[#2A2438] rounded w-4/5" />
                  <div className="h-3.5 bg-gray-200 dark:bg-[#2A2438] rounded w-2/3" />
                  <div className="h-3.5 bg-gray-200 dark:bg-[#2A2438] rounded w-1/2" />
                </div>
              </div>
            </div>
          )}


          {!isHydrating && messages.map((msg, msgIdx) => {
            if (msg.role === 'user') {
              return <UserMessage key={msg.id}>{msg.content}</UserMessage>;
            }

            // Avatar appears only on the first agent bubble after a user message
            const prevMsg = messages[msgIdx - 1];
            const isFirstAgentInRun = !prevMsg || prevMsg.role === 'user';

            // Recomputed fresh on every render from the current (possibly
            // partial) content — see computeIncrementalPlan's docstring for
            // the monotonicity guarantee this relies on while streaming.
            const plan = computeIncrementalPlan(msg.content, msg.renderEvents ?? [], !!msg.isStreaming);

            return (
              <div key={msg.id} className="flex flex-col gap-1.5">
                {msg.isStreaming && !msg.content && !msg.renderEvents?.length ? (
                  <AgentMessage showAvatar={isFirstAgentInRun}>
                    <TypingIndicator />
                  </AgentMessage>
                ) : (
                  plan.map((segment, i) =>
                    segment.kind === 'text' ? (
                      <AgentMessage key={i} showAvatar={isFirstAgentInRun && i === 0}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {segment.content}
                        </ReactMarkdown>
                      </AgentMessage>
                    ) : (
                      /* Render events indent past the avatar (w-7 + gap-2 = 36px) */
                      <div key={i} className="pl-9">
                        <RenderEventView
                          event={segment.event}
                          isStreaming={msg.isStreaming}
                          onAddToCart={handleAddToCart}
                          onViewDetail={handleViewDetail}
                          onBuyNow={handleBuyNow}
                          onSendMessage={(t) => { sendMessage(t).catch(() => null); }}
                        />
                      </div>
                    ),
                  )
                )}
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input bar */}
      <footer
        className="border-t border-gray-100 dark:border-[#3A3350] px-4 pt-3 bg-white dark:bg-[#17141F] flex-shrink-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0.75rem))' }}
      >
        <div className="max-w-2xl mx-auto w-full">
          <ChatInput onSend={(t) => { sendMessage(t).catch(() => null); }} disabled={isLoading || isHydrating} />
        </div>
      </footer>

        </div>{/* end chat column */}
      </div>{/* end sidebar + chat row */}

      {/* Drawers */}
      <ProductDetailDrawer
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={checkoutSingleItem}
      />
      <CartDrawer
        items={cartItems}
        total={cartTotal}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={() => setIsCartOpen(false)}
        onQuantityChange={handleQuantityChange}
        onRemove={handleRemoveFromCart}
      />
    </div>
  );
}
