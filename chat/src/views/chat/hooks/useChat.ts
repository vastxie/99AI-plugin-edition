import { useChatStore } from '@/store/modules/chat'

export function useChat() {
  const chatStore = useChatStore()

  const addGroupChat = (chat: Chat.Chat) => {
    chatStore.addGroupChat(chat)
  }

  const updateGroupChat = (index: number, chat: Chat.Chat) => {
    chatStore.updateGroupChat(index, chat)
  }

  const updateGroupChatSome = (index: number, chat: Partial<Chat.Chat>) => {
    chatStore.updateGroupChatSome(index, chat)
  }

  return {
    addGroupChat,
    updateGroupChat,
    updateGroupChatSome,
  }
}
