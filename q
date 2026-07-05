[33mcommit 858421a7f63a17f7ae5a1f1fd0af7775b8855312[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m)[m
Author: Ahmed Shaa <ahmedshaa49@gmail.com>
Date:   Sun Jul 5 10:28:33 2026 +0530

    getproducts search optimization ui

[1mdiff --git a/app/page.tsx b/app/page.tsx[m
[1mindex b9472d0..37dba9b 100644[m
[1m--- a/app/page.tsx[m
[1m+++ b/app/page.tsx[m
[36m@@ -245,6 +245,7 @@[m [mexport default function Home(): React.JSX.Element {[m
 [m
   async function sendMessage(text: string): Promise<void> {[m
     if (!text.trim() || isLoading || !sessionId) return;[m
[32m+[m[32m    setCartPending(false);[m
     setIsLoading(true);[m
 [m
     const userMsgId = uuid();[m
[36m@@ -370,12 +371,14 @@[m [mexport default function Home(): React.JSX.Element {[m
       return;[m
     }[m
     setCartPending(true);[m
[32m+[m[32m    setTimeout(() => setCartPending(false), 10_000);[m
     const optimisticItems = cartItems.map((i) => (i.productId === productId ? { ...i, quantity: newQuantity } : i));[m
     mutateCartDirect('updateQuantity', productId, optimisticItems, newQuantity);[m
   }[m
 [m
   function handleRemoveFromCart(productId: string): void {[m
     setCartPending(true);[m
[32m+[m[32m    setTimeout(() => setCartPending(false), 10_000);[m
     const optimisticItems = cartItems.filter((i) => i.productId !== productId);[m
     mutateCartDirect('remove', productId, optimisticItems);[m
   }[m
[1mdiff --git a/kapruka-checkpoints.db-shm b/kapruka-checkpoints.db-shm[m
[1mindex a1f961a..819d1e0 100644[m
Binary files a/kapruka-checkpoints.db-shm and b/kapruka-checkpoints.db-shm differ
[1mdiff --git a/kapruka-checkpoints.db-wal b/kapruka-checkpoints.db-wal[m
[1mindex d1c0efd..8fe6782 100644[m
Binary files a/kapruka-checkpoints.db-wal and b/kapruka-checkpoints.db-wal differ
[1mdiff --git a/src/components/chat/RenderEventView.tsx b/src/components/chat/RenderEventView.tsx[m
[1mindex 6cc8db7..2a8b10d 100644[m
[1m--- a/src/components/chat/RenderEventView.tsx[m
[1m+++ b/src/components/chat/RenderEventView.tsx[m
[36m@@ -1,39 +1,14 @@[m
 'use client';[m
 [m
[31m-import { useState } from 'react';[m
 import { AlertCircle, Loader2 } from 'lucide-react';[m
 import type { RenderEvent, UIProduct } from '@/agent/state.js';[m
 import ProductCarousel from '@/components/products/ProductCarousel.js';[m
[32m+[m[32mimport ProductCard from '@/components/products/ProductCard.js';[m
 import RecommendationCarousel from '@/components/products/RecommendationCarousel.js';[m
[31m-import ProductDetailDrawer from '@/components/products/ProductDetailDrawer.js';[m
 import DeliveryCard from '@/components/delivery/DeliveryCard.js';[m
 import CheckoutPanel from '@/components/checkout/CheckoutPanel.js';[m
 import ResponseCard from '@/components/ui/ResponseCard.js';[m
 [m
[31m-/**[m
[31m- * Subcomponent so useState can live outside the switch-case in RenderEventView.[m
[31m- * Starts open; the X button closes it in-place without unmounting the message.[m
[31m- */[m
[31m-function ProductDetailEvent({[m
[31m-  product,[m
[31m-  onAddToCart,[m
[31m-  onBuyNow,[m
[31m-}: {[m
[31m-  product: UIProduct;[m
[31m-  onAddToCart: (p: UIProduct, qty: number) => void;[m
[31m-  onBuyNow: (p: UIProduct, qty: number) => void;[m
[31m-}): React.JSX.Element {[m
[31m-  const [open, setOpen] = useState(true);[m
[31m-  return ([m
[31m-    <ProductDetailDrawer[m
[31m-      product={open ? product : null}[m
[31m-      onClose={() => setOpen(false)}[m
[31m-      onAddToCart={onAddToCart}[m
[31m-      onBuyNow={onBuyNow}[m
[31m-    />[m
[31m-  );[m
[31m-}[m
[31m-[m
 interface RenderEventViewProps {[m
   event: RenderEvent;[m
   isStreaming?: boolean;[m
[36m@@ -67,11 +42,16 @@[m [mexport default function RenderEventView({[m
 [m
     case 'PRODUCT_DETAIL':[m
       return ([m
[31m-        <ProductDetailEvent[m
[31m-          product={event.product}[m
[31m-          onAddToCart={(p, qty) => onAddToCart(p, qty)}[m
[31m-          onBuyNow={(p, qty) => onBuyNow(p, qty)}[m
[31m-        />[m
[32m+[m[32m        <div className="w-[210px]">[m
[32m+[m[32m          <ProductCard[m
[32m+[m[32m            product={event.product}[m
[32m+[m[32m            index={0}[m
[32m+[m[32m            variant="detail"[m
[32m+[m[32m            onAddToCart={(p) => onAddToCart(p)}[m
[32m+[m[32m            onViewDetail={() => undefined}[m
[32m+[m[32m            onBuyNow={() => undefined}[m
[32m+[m[32m          />[m
[32m+[m[32m        </div>[m
       );[m
 [m
     case 'CART':[m
[1mdiff --git a/src/components/products/ProductCard.tsx b/src/components/products/ProductCard.tsx[m
[1mindex 072cb5e..8e818b8 100644[m
[1m--- a/src/components/products/ProductCard.tsx[m
[1m+++ b/src/components/products/ProductCard.tsx[m
[36m@@ -11,6 +11,7 @@[m [minterface ProductCardProps {[m
   onAddToCart: (product: UIProduct) => void;[m
   onViewDetail: (product: UIProduct) => void;[m
   onBuyNow: (product: UIProduct) => void;[m
[32m+[m[32m  variant?: 'list' | 'detail';[m
 }[m
 [m
 export default function ProductCard({[m
[36m@@ -19,6 +20,7 @@[m [mexport default function ProductCard({[m
   onAddToCart,[m
   onViewDetail,[m
   onBuyNow,[m
[32m+[m[32m  variant = 'list',[m
 }: ProductCardProps): React.JSX.Element {[m
   const [imgError, setImgError] = useState(false);[m
   const shouldReduce = useReducedMotion();[m
[36m@@ -29,7 +31,6 @@[m [mexport default function ProductCard({[m
   // §8 badge: vendor name if present, else category. Stock state stacked below.[m
   const primaryBadge = product.vendor || product.category || null;[m
   const showOutOfStock = product.in_stock === 'out_of_stock';[m
[31m-  const showLowStock = product.in_stock === 'low_stock';[m
 [m
   // §8 secondary line: weight if present (vendor is already in badge when available,[m
   // so weight is the non-duplicate field to surface here).[m
[36m@@ -44,12 +45,12 @@[m [mexport default function ProductCard({[m
     >[m
       {/* Image — 1:1 aspect, clicking opens detail drawer */}[m
       <div[m
[31m-        role="button"[m
[31m-        tabIndex={0}[m
[31m-        aria-label={`View details for ${product.name}`}[m
[31m-        className="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-[#2A2438] cursor-pointer"[m
[31m-        onClick={() => onViewDetail(product)}[m
[31m-        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewDetail(product); }}[m
[32m+[m[32m        role={variant === 'list' ? 'button' : undefined}[m
[32m+[m[32m        tabIndex={variant === 'list' ? 0 : undefined}[m
[32m+[m[32m        aria-label={variant === 'list' ? `View details for ${product.name}` : undefined}[m
[32m+[m[32m        className={['relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-[#2A2438]', variant === 'list' ? 'cursor-pointer' : ''].join(' ')}[m
[32m+[m[32m        onClick={variant === 'list' ? () => onViewDetail(product) : undefined}[m
[32m+[m[32m        onKeyDown={variant === 'list' ? (e) => { if (e.key === 'Enter' || e.key === ' ') onViewDetail(product); } : undefined}[m
       >[m
         {showFallback ? ([m
           <div className={['w-full h-full flex items-center justify-center', showOutOfStock ? 'grayscale' : ''].join(' ')}>[m
[36m@@ -66,7 +67,7 @@[m [mexport default function ProductCard({[m
         )}[m
 [m
         {/* §8 badges — top-left overlay */}[m
[31m-        {(primaryBadge || showOutOfStock || showLowStock) && ([m
[32m+[m[32m        {(primaryBadge || showOutOfStock) && ([m
           <div className="absolute top-2 left-2 flex flex-col gap-1">[m
             {primaryBadge && ([m
               <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-white/85 dark:bg-[#201C2C]/85 text-gray-700 dark:text-[#F2F0F5] backdrop-blur-sm">[m
[36m@@ -78,11 +79,6 @@[m [mexport default function ProductCard({[m
                 Out of stock[m
               </span>[m
             )}[m
[31m-            {showLowStock && ([m
[31m-              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-amber-700 text-white">[m
[31m-                Low stock[m
[31m-              </span>[m
[31m-            )}[m
           </div>[m
         )}[m
       </div>[m
[36m@@ -91,8 +87,8 @@[m [mexport default function ProductCard({[m
       <div className="p-3 flex flex-col flex-1 gap-1">[m
         {/* Name */}[m
         <p[m
[31m-          className="text-sm font-medium text-gray-900 dark:text-[#F2F0F5] line-clamp-2 leading-snug cursor-pointer"[m
[31m-          onClick={() => onViewDetail(product)}[m
[32m+[m[32m          className={['text-sm font-medium text-gray-900 dark:text-[#F2F0F5] line-clamp-2 leading-snug', variant === 'list' ? 'cursor-pointer' : ''].join(' ')}[m
[32m+[m[32m          onClick={variant === 'list' ? () => onViewDetail(product) : undefined}[m
         >[m
           {product.name}[m
         </p>[m
[36m@@ -109,22 +105,23 @@[m [mexport default function ProductCard({[m
           LKR {product.price.toLocaleString()}[m
         </p>[m
 [m
[31m-        {/* §8 Two labeled buttons — always visible, never icon-only */}[m
         <div className="mt-auto pt-2 flex gap-1.5">[m
[31m-          <button[m
[31m-            type="button"[m
[31m-            onClick={(e) => { e.stopPropagation(); onBuyNow(product); }}[m
[31m-            disabled={product.in_stock === 'out_of_stock'}[m
[31m-            className={[[m
[31m-              'flex-1 text-[11px] font-semibold py-1.5 rounded-lg',[m
[31m-              'bg-yellow-500 text-purple-700',[m
[31m-              'hover:bg-yellow-400 transition-colors duration-150 motion-reduce:transition-none',[m
[31m-              'focus-visible:outline-none focus-visible:shadow-focus',[m
[31m-              'disabled:opacity-40 disabled:cursor-not-allowed',[m
[31m-            ].join(' ')}[m
[31m-          >[m
[31m-            Buy now[m
[31m-          </button>[m
[32m+[m[32m          {variant === 'list' && ([m
[32m+[m[32m            <button[m
[32m+[m[32m              type="button"[m
[32m+[m[32m              onClick={(e) => { e.stopPropagation(); onBuyNow(product); }}[m
[32m+[m[32m              disabled={product.in_stock === 'out_of_stock'}[m
[32m+[m[32m              className={[[m
[32m+[m[32m                'flex-1 text-[11px] font-semibold py-1.5 rounded-lg',[m
[32m+[m[32m                'bg-yellow-500 text-purple-700',[m
[32m+[m[32m                'hover:bg-yellow-400 transition-colors duration-150 motion-reduce:transition-none',[m
[32m+[m[32m                'focus-visible:outline-none focus-visible:shadow-focus',[m
[32m+[m[32m                'disabled:opacity-40 disabled:cursor-not-allowed',[m
[32m+[m[32m              ].join(' ')}[m
[32m+[m[32m            >[m
[32m+[m[32m              Buy now[m
[32m+[m[32m            </button>[m
[32m+[m[32m          )}[m
           <button[m
             type="button"[m
             onClick={(e) => { e.stopPropagation(); onAddToCart(product); }}[m
