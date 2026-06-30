/**
 * MCP call-flow debugger
 *
 * Traces a single kapruka_search_products call through every layer of the stack:
 *
 *   Your code
 *     → MCP Client  (protocol layer — serialises the call into a JSON-RPC 2.0 request)
 *       → InMemoryTransport  (in-process "wire" — no sockets, no HTTP)
 *         → McpServer / KaprukaLocal  (protocol layer — deserialises the request,
 *                                       dispatches to the registered tool handler)
 *           → Tool handler  (application layer — runs the actual business logic)
 *         ← McpServer serialises the result into a JSON-RPC 2.0 response
 *       ← InMemoryTransport carries it back
 *     ← MCP Client deserialises and returns result.content[0].text
 *
 * Each "=== STEP ===" section corresponds to one hop in that chain.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { KaprukaLocal } from 'kapruka-mcp/local';
import { MemoryStorage } from 'kapruka-mcp/storage';
import { TOOL_NAMES } from 'kapruka-mcp';

const TOOL = TOOL_NAMES.search_products; // "kapruka_search_products"
const ARGS = { q: 'roses' };

async function main(): Promise<void> {
  // ─── SETUP ───────────────────────────────────────────────────────────────
  // KaprukaLocal is an McpServer. It registers all 15 kapruka_* tools.
  // MemoryStorage holds the cart in-process (no SQLite needed for mock mode).
  const local = new KaprukaLocal({
    mock: true, // use bundled mock catalogue — no network calls
    storage: new MemoryStorage(),
    events: {
      // onToolCall fires INSIDE the server handler, right after the McpServer
      // has parsed the JSON-RPC request and matched it to a registered tool.
      // This is "STEP 2" territory — the server has received and dispatched.
      onToolCall: (toolName: string, args: unknown) => {
        console.log('\n=== STEP 2: SERVER RECEIVES AND PROCESSES ===');
        console.log('// MCP concept: the McpServer deserialized the JSON-RPC "tools/call"');
        console.log('// request and invoked the matching registered handler.');
        console.log('Tool dispatched to handler:', toolName);
        console.log('Arguments received by handler:', JSON.stringify(args, null, 2));
      },
      onError: (toolName: string, error: Error) => {
        console.error('Server-side error in', toolName, ':', error.message);
      },
    },
  });

  // InMemoryTransport creates a linked pair of transports.
  // Calling server.connect(serverTransport) and client.connect(clientTransport)
  // wires the two ends together in-process — same call semantics as a WebSocket
  // or stdio transport, but with zero I/O latency.
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await local.getServer().connect(serverTransport);

  // The MCP Client is the caller side of the JSON-RPC 2.0 protocol.
  // client.callTool() serialises a "tools/call" request, sends it over the
  // transport, and waits for the "tools/call" response.
  const client = new Client({ name: 'watch-tool-call-debug', version: '0.0.1' });
  await client.connect(clientTransport);

  // ─── STEP 1 ───────────────────────────────────────────────────────────────
  console.log('=== STEP 1: CLIENT SENDS REQUEST ===');
  console.log('// MCP concept: client.callTool() wraps the call in a JSON-RPC 2.0');
  console.log('// "tools/call" request: { method: "tools/call", params: { name, arguments } }');
  console.log('// InMemoryTransport delivers it synchronously to the server.');
  console.log('Tool name :', TOOL);
  console.log('Arguments :', JSON.stringify(ARGS, null, 2));

  // ─── MAKE THE CALL ────────────────────────────────────────────────────────
  // client.callTool() returns CallToolResult:
  //   { content: Array<{ type: "text", text: string } | { type: "image", ... }>, isError?: boolean }
  // The tool handler always returns this.textContent(json) — a single text block.
  const rawResult = await client.callTool(
    { name: TOOL, arguments: ARGS },
    undefined,
    { signal: AbortSignal.timeout(10_000) },
  );

  // ─── STEP 3 ───────────────────────────────────────────────────────────────
  console.log('\n=== STEP 3: RAW RESPONSE ===');
  console.log('// MCP concept: the server returned a JSON-RPC 2.0 "tools/call" response.');
  console.log('// The Client decoded it into a CallToolResult object.');
  console.log('// result.content is always an array — tools may return multiple blocks.');
  console.log('isError          :', rawResult.isError ?? false);
  console.log('content.length   :', rawResult.content.length);
  console.log('content[0] type  :', typeof rawResult.content[0]);

  const firstBlock = rawResult.content[0] as { type: string; text?: string };
  console.log('content[0].type  :', firstBlock.type);       // always "text" for kapruka tools
  console.log('content[0].text typeof :', typeof firstBlock.text);
  console.log('content[0].text (raw) :');
  console.log(firstBlock.text);

  // ─── STEP 4 ───────────────────────────────────────────────────────────────
  console.log('\n=== STEP 4: PARSED RESPONSE ===');
  console.log('// Application concept: the text payload is JSON.');
  console.log('// KaprukaAdapter.callTool() does exactly this parse in production.');

  const text = firstBlock.text ?? '';

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.log('JSON.parse failed:', err instanceof Error ? err.message : String(err));
    console.log('The response is plain text or Markdown, not JSON.');
    process.exit(0);
  }

  console.log('Parsed type        :', Array.isArray(parsed) ? 'array' : typeof parsed);

  // SearchResult shape: { products: Product[], total: number, query: string }
  const sr = parsed as { products?: unknown[]; total?: number; query?: string };
  console.log('query              :', sr.query);
  console.log('total              :', sr.total);
  console.log('products.length    :', sr.products?.length ?? 'N/A');

  if (Array.isArray(sr.products) && sr.products.length > 0) {
    const first = sr.products[0] as Record<string, unknown>;
    console.log('\nFirst product:');
    console.log('  id             :', first.id);
    console.log('  name           :', first.name);
    console.log('  price          :', first.price);
    console.log('  image_url      :', first.image_url);
    console.log('  in_stock       :', first.in_stock);
  }

  console.log('\n=== DONE ===');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
