import { acceptInviteConfig } from "./accept-invite";
import { archiveEmailConfig } from "./archive-email";
import { createDraftReplyConfig } from "./create-draft-reply";
import { deleteDraftConfig } from "./delete-draft";
import { filterSenderConfig } from "./filter-sender";
import { nextEmailConfig } from "./next-email";
import { ToolRegistryManager } from "./registry";
import { sendDraftConfig } from "./send-draft";
import { unsubscribeConfig } from "./unsubscribe";
import { updateDraftReplyConfig } from "./update-draft-reply";

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
