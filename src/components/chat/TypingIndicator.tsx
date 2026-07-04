'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function TypingIndicator(): React.JSX.Element {
  const shouldReduce = useReducedMotion();

  return (
    <div className="flex items-center gap-1.5" role="status" aria-label="Kasun is typing">
      {[0, 1, 2].map((i) =>
        shouldReduce ? (
          <span key={i} className="w-2 h-2 rounded-full bg-gray-300 dark:bg-[#3A3350] block" />
        ) : (
          <motion.span
            key={i}
            className="w-2 h-2 rounded-full bg-gray-400 dark:bg-[#A79FBB] block"
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity, ease: 'easeInOut' }}
          />
        ),
      )}
    </div>
  );
}
