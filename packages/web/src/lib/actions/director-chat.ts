'use server';

/**
 * Server actions — director chat (NARRATIVE_AGENTS.md §12.4).
 * Consumed by the admin DirectorChatPanel.
 */

import { runDirectorChat, type DirectorChatResult } from '@/lib/director/chat';
import { readDirectorMemory, type ChatTurn } from '@/lib/director/memory-store';

export async function sendDirectorChatAction(input: {
  message: string;
}): Promise<DirectorChatResult> {
  const message = input.message?.trim();
  if (!message) {
    return { ok: false, reply: '', toolCalls: [], error: '訊息不可為空' };
  }
  return runDirectorChat(message);
}

export async function getDirectorChatHistoryAction(): Promise<ChatTurn[]> {
  return readDirectorMemory().chat;
}
