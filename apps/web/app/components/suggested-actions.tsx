"use client";

import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { ChatRequestOptions, CreateMessage, Message } from "ai";
import { memo } from "react";

interface SuggestedActionsProps {
  chatId: string;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
}

function PureSuggestedActions({ chatId, append }: SuggestedActionsProps) {
  const suggestedActions = [
    {
      title: "Let's go through the emails in my inbox.",
      label: "I really want to get to inbox zero.",
      action:
        "Let's go through the emails in my inbox. I really want to get to inbox zero.",
    },
    // {
    //   title: "What are the advantages",
    //   label: "of using Next.js?",
    //   action: "What are the advantages of using Next.js?",
    // },
    // {
    //   title: "Write code to",
    //   label: `demonstrate djikstra's algorithm`,
    //   action: `Write code to demonstrate djikstra's algorithm`,
    // },
    // {
    //   title: "Help me write an essay",
    //   label: `about silicon valley`,
    //   action: `Help me write an essay about silicon valley`,
    // },
    // {
    //   title: "What is the weather",
    //   label: "in San Francisco?",
    //   action: "What is the weather in San Francisco?",
    // },
  ];

  // Determine grid columns based on number of actions
  const gridClass =
    suggestedActions.length === 1
      ? "w-1/2 mx-auto" // Single column for one action
      : "grid sm:grid-cols-2 gap-2 w-full"; // Original two-column grid for multiple actions

  return (
    <div className={gridClass}>
      {suggestedActions.map((suggestedAction, index) => {
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.05 * index }}
            key={`suggested-action-${suggestedAction.title}-${index}`}
            className={index > 1 ? "hidden sm:block" : "block"}
          >
            <Button
              variant="ghost"
              onClick={async (e) => {
                e.preventDefault();
                append({
                  role: "user",
                  content: suggestedAction.action,
                });
              }}
              className="text-left border rounded-xl px-4 py-3.5 text-sm flex-1 gap-1 sm:flex-col w-full h-auto justify-start items-start"
            >
              <span className="font-medium">{suggestedAction.title}</span>
              <span className="text-muted-foreground">
                {suggestedAction.label}
              </span>
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions, () => true);
