'use client';

import { useEffect, useRef, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

import type { RenderEvent, UICartItem, UIProduct } from '@/agent/state.js';
import ChatInput from '@/components/chat/ChatInput.js';
import TypingIndicator from '@/components/chat/TypingIndicator.js';
import RenderEventView from '@/components/chat/RenderEventView.js';
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
      className="text-blue-600 underline hover:text-blue-700"
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
  const [selectedProduct, setSelectedProduct] = useState<UIProduct | null>(null);
  const [browserId, setBrowserId] = useState('');
  const sessionId = useRef(uuid());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('kapruka_browser_id');
    if (stored) {
      setBrowserId(stored);
    } else {
      const id = uuid();
      window.localStorage.setItem('kapruka_browser_id', id);
      setBrowserId(id);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        setCartItems(ev.items);
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
    if (!sessionId.current) return;

    let activeReactiveMsgId: string | null = null;
    const source = new EventSource(`/api/chat/reactive-stream?sessionId=${encodeURIComponent(sessionId.current)}`);

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
  }, []);

  async function sendMessage(text: string): Promise<void> {
    if (!text.trim() || isLoading) return;
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
          sessionId: sessionId.current,
          locale: 'en',
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
      body: JSON.stringify({ sessionId: sessionId.current, action, productId, quantity }),
    })
      .then((res) => res.json())
      .then((data: { ok: boolean; items?: UICartItem[]; total?: number }) => {
        if (data.ok && data.items && typeof data.total === 'number') {
          setCartItems(data.items);
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

  function handleAddToCart(product: UIProduct): void {
    const existing = cartItems.find((i) => i.productId === product.id);
    const optimisticItems = existing
      ? cartItems.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
      : [...cartItems, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];

    mutateCartDirect('add', product.id, optimisticItems, 1);
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

  function handleViewDetail(product: UIProduct): void {
    // Open immediately with the thin shape already in hand (good perceived
    // performance), then replace with the full shape (real description) once
    // the fetch resolves. Search results never carry a description — only
    // getProduct does — so the thin shape alone would show an empty drawer.
    setSelectedProduct(product);

    fetch(`/api/products/${encodeURIComponent(product.id)}`)
      .then((res) => res.json())
      .then((data: { ok: boolean; product?: UIProduct }) => {
        if (data.ok && data.product) {
          setSelectedProduct((current) => (current?.id === product.id ? (data.product as UIProduct) : current));
        }
      })
      .catch(() => null);
  }

  const cartCount = cartItems.reduce((n, item) => n + item.quantity, 0);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="h-14 border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-lg text-gray-900">Kasun</span>
          <span className="text-sm text-gray-400">Kapruka Shopping Assistant</span>
        </div>
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="relative p-2 text-gray-500 hover:text-gray-900 transition-colors"
          aria-label={`Cart — ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        >
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {cartCount > 9 ? '9+' : cartCount}
            </span>
          )}
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto w-full space-y-5">
          {messages.length === 0 && (
            <div className="text-center mt-16">
              <p className="text-2xl font-semibold text-gray-800">Hi, I&apos;m Kasun.</p>
              <p className="text-gray-400 mt-2 text-sm">
                Tell me what you&apos;re looking for — a gift, an occasion, or a product.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-900 max-w-[80%] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                </div>
              );
            }

            // Recomputed fresh on every render from the current (possibly
            // partial) content — see computeIncrementalPlan's docstring for
            // the monotonicity guarantee this relies on while streaming.
            const plan = computeIncrementalPlan(msg.content, msg.renderEvents ?? [], !!msg.isStreaming);

            return (
              <div key={msg.id} className="flex flex-col">
                {msg.isStreaming && !msg.content && !msg.renderEvents?.length ? (
                  <TypingIndicator />
                ) : (
                  plan.map((segment, i) =>
                    segment.kind === 'text' ? (
                      <div key={i} className="text-sm leading-relaxed text-gray-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {segment.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <RenderEventView
                        key={i}
                        event={segment.event}
                        isStreaming={msg.isStreaming}
                        onAddToCart={handleAddToCart}
                        onViewDetail={handleViewDetail}
                        onSendMessage={(t) => { sendMessage(t).catch(() => null); }}
                      />
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
      <footer className="border-t border-gray-100 px-4 py-3 bg-white flex-shrink-0">
        <div className="max-w-2xl mx-auto w-full">
          <ChatInput onSend={(t) => { sendMessage(t).catch(() => null); }} disabled={isLoading} />
        </div>
      </footer>

      {/* Drawers */}
      <ProductDetailDrawer
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
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
