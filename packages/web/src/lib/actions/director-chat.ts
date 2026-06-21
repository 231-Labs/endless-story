'use server';

/**
 * Server actions — director chat (NARRATIVE_AGENTS.md §12.4).
 * Consumed by the admin DirectorChatPanel.
 */

import { runDirectorChat, type DirectorChatResult } from '@/lib/director/chat';

export async function sendDirectorChatAction(input: {
  message: string;
}): Promise<DirectorChatResult> {
  const message = input.message?.trim();
  if (!message) {
    return { ok: false, reply: '', toolCalls: [], error: '訊息不可為空' };
  }
  return runDirectorChat(message);
}
