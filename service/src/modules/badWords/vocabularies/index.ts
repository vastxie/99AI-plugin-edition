/**
 * 开源发行版不捆绑来源与许可证不明确的第三方敏感词数据。
 * 模块接口保留；部署者可接入受许可的数据源或使用已有的外部审核服务。
 */
export const VOCABULARIES: Record<string, Set<string>> = {};
export const VOCABULARY_META: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  count: number;
}> = [];

/* 词库ID列表 */
export type VocabularyId = string;

/* 获取指定词库 */
export function getVocabulary(id: string): Set<string> | undefined {
  return VOCABULARIES[id];
}

/* 合并多个词库，返回去重后的 Set */
export function mergeVocabularies(ids: string[]): Set<string> {
  const merged = new Set<string>();
  for (const id of ids) {
    const vocab = VOCABULARIES[id];
    if (vocab) {
      for (const word of vocab) {
        merged.add(word);
      }
    }
  }
  return merged;
}

/* 获取所有词库的ID列表 */
export function getAllVocabularyIds(): string[] {
  return Object.keys(VOCABULARIES);
}

/* 统计信息 */
export const VOCABULARY_STATS = {
  totalVocabularies: 0,
  totalWords: 0,
};
