import { acceptInviteConfig } from "~/tools/accept-invite";
import { archiveEmailConfig } from "~/tools/archive-email";
import { createDraftReplyConfig } from "~/tools/create-draft-reply";
import { deleteDraftConfig } from "~/tools/delete-draft";
import { filterSenderConfig } from "~/tools/filter-sender";
import { nextEmailConfig } from "~/tools/next-email";
import { sendDraftConfig } from "~/tools/send-draft";
import { unsubscribeConfig } from "~/tools/unsubscribe";
import { updateDraftReplyConfig } from "~/tools/update-draft-reply";
import { ToolRegistryManager } from "./registry";

/**
 * A singleton instance of ToolRegistryManager with all available tools registered.
 * Use this registry to ensure consistency across different parts of the application.
 */
const registry = new ToolRegistryManager();

// Register all tools
registry.registerTool(acceptInviteConfig);
registry.registerTool(archiveEmailConfig);
registry.registerTool(createDraftReplyConfig);
registry.registerTool(deleteDraftConfig);
registry.registerTool(filterSenderConfig);
registry.registerTool(nextEmailConfig);
registry.registerTool(sendDraftConfig);
registry.registerTool(unsubscribeConfig);
registry.registerTool(updateDraftReplyConfig);

export default registry;
