'use client';

import { motion } from 'framer-motion';

export default function TypingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 block"
          animate={{ scale: [1, 1.5, 1] }}
          transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
