import { motion } from "framer-motion";

import { MessageIcon, VercelIcon } from "./icons";
import { Zap } from "lucide-react";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <p className="flex flex-row justify-center gap-4 items-center">
          <Zap />
        </p>
        <p>Welcome to Blitz. Start chatting with your email below!</p>
      </div>
    </motion.div>
  );
};
