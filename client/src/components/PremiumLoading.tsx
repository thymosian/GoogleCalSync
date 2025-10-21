import { motion } from 'framer-motion';

export function PremiumLoading() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-2 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 w-12 h-12 border-2 border-transparent border-t-purple-600 dark:border-t-purple-400 rounded-full"
          />
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-gray-600 dark:text-gray-400"
        >
          Loading premium experience...
        </motion.p>
      </div>
    </div>
  );
}