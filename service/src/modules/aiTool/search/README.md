# 文件向量缓存服务使用指南

## 概述

`FileVectorCacheService` 是一个独立的向量缓存服务，提供了向量的保存、检索、删除功能。支持两种文件类型：

- **user（用户文件）**：短期缓存，默认 3 天过期，适合用户上传的临时文件
- **system（系统文件）**：永久缓存，适合系统级知识库或管理员上传的文件

## 📋 目录

- [服务方法使用](#核心功能)
- [管理端 API 接口](#管理端-api-接口)
- [集成示例](#在-filevectorsearchservice-中集成)
- [数据库表结构](#数据库表结构)

---

## 核心功能

### 1. 保存向量缓存

```typescript
import { FileVectorCacheService } from './fileVectorCache.service';

// 保存用户文件向量（3天后过期）
await fileVectorCacheService.saveVectors(
  fileUrl,           // 文件URL
  textChunks,        // 文本分块数组
  vectors,           // 向量数组
  'text-embedding-ada-002',  // 模型信息
  {
    fileType: 'user',       // 文件类型
    userId: 123,            // 用户ID（user类型必填）
    fileContent: '文件内容...',  // 可选
    expiresInDays: 3        // 过期天数（默认3天）
  }
);

// 保存系统文件向量（永不过期）
await fileVectorCacheService.saveVectors(
  fileUrl,
  textChunks,
  vectors,
  'text-embedding-ada-002',
  {
    fileType: 'system',      // 系统文件
    // userId 不需要
    // expiresAt 自动设置为 null（永久）
  }
);
```

### 2. 获取向量缓存

```typescript
// 从缓存获取向量
const cached = await fileVectorCacheService.getVectors(fileUrl);

if (cached) {
  console.log('缓存命中！');
  console.log('分块:', cached.chunks);
  console.log('向量:', cached.vectors);
  console.log('文件类型:', cached.fileType);
  console.log('用户ID:', cached.userId);

  // 使用缓存的向量进行相似度计算
  // ... 省略向量化步骤，直接使用 cached.vectors
} else {
  console.log('缓存未命中，需要重新向量化');
  // ... 执行向量化流程
}
```

### 3. 删除向量缓存

```typescript
// 删除单个文件的缓存
const success = await fileVectorCacheService.deleteVectors(fileUrl);

// 批量删除用户的所有向量缓存
const count = await fileVectorCacheService.deleteUserVectors(userId);
console.log(`删除了用户 ${userId} 的 ${count} 条向量缓存`);
```

### 4. 清理过期缓存（自动执行）

定时任务每天凌晨 2 点自动清理过期缓存，无需手动调用。

也可以手动调用：
```typescript
const deletedCount = await fileVectorCacheService.cleanExpiredCache();
console.log(`清理了 ${deletedCount} 条过期缓存`);
```

### 5. 获取缓存统计

```typescript
const stats = await fileVectorCacheService.getStats();
console.log('总缓存数:', stats.total);
console.log('用户文件:', stats.userFiles);
console.log('系统文件:', stats.systemFiles);
console.log('过期文件:', stats.expired);
```

## 在 FileVectorSearchService 中集成

在文件向量搜索服务中使用缓存的示例流程：

```typescript
async fileVectorSearch(fileUrl: string, userQuery: string, userId: number) {
  // 1. 检查缓存
  const cached = await this.fileVectorCacheService.getVectors(fileUrl);

  let vectors: any[];
  let textChunks: string[];

  if (cached) {
    // 缓存命中，直接使用
    Logger.log('使用缓存的向量数据');
    vectors = cached.vectors;
    textChunks = cached.chunks;
  } else {
    // 缓存未命中，执行向量化
    const fileContent = await this.extractTextFromUrl(fileUrl);
    textChunks = this.chunkText(fileContent, 1000);
    vectors = await this.vectorizeChunks(textChunks);

    // 保存到缓存（用户文件，3天过期）
    await this.fileVectorCacheService.saveVectors(
      fileUrl,
      textChunks,
      vectors,
      'text-embedding-ada-002',
      {
        fileType: 'user',
        userId: userId,
        expiresInDays: 3
      }
    );
  }

  // 2. 继续后续的相似度计算...
}
```

## 管理员上传系统文件

管理员可以通过管理端上传永久文件：

```typescript
// 管理员接口示例
async uploadSystemFile(fileUrl: string) {
  // 1. 提取文本并分块
  const fileContent = await this.extractTextFromUrl(fileUrl);
  const textChunks = this.chunkText(fileContent, 1000);

  // 2. 向量化
  const vectors = await this.vectorizeChunks(textChunks);

  // 3. 保存为系统文件（永不过期）
  await this.fileVectorCacheService.saveVectors(
    fileUrl,
    textChunks,
    vectors,
    'text-embedding-ada-002',
    {
      fileType: 'system'  // 系统文件，永久缓存
    }
  );

  return { success: true, message: '系统文件已保存' };
}
```

## 数据库表结构

```sql
CREATE TABLE file_vector_cache (
  id INT PRIMARY KEY AUTO_INCREMENT,
  file_hash VARCHAR(64) UNIQUE COMMENT '文件URL的SHA256哈希',
  file_url TEXT COMMENT '原始文件URL',
  file_content MEDIUMTEXT COMMENT '提取的文本内容',
  chunks JSON COMMENT '文本分块数组',
  vectors JSON COMMENT '向量化结果',
  model_info VARCHAR(200) COMMENT '使用的模型',
  file_type ENUM('user', 'system') DEFAULT 'user' COMMENT '文件类型',
  expires_at TIMESTAMP NULL COMMENT '过期时间，NULL表示永不过期',
  user_id INT COMMENT '用户ID（user类型时必填）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_file_hash (file_hash),
  INDEX idx_file_type (file_type),
  INDEX idx_expires_at (expires_at),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 定时任务

系统会自动执行以下定时任务：

1. **每天凌晨 2 点**：清理过期的向量缓存
2. **每小时**：输出缓存统计信息（用于监控）

---

## 管理端 API 接口

**基础路径**: `/api/fileVectorCache`

**权限要求**: 所有接口都需要超级管理员权限（SuperAuthGuard）

### 1. 获取缓存统计信息

```http
GET /api/fileVectorCache/stats
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "total": 150,
    "userFiles": 120,
    "systemFiles": 30,
    "expired": 5
  }
}
```

### 2. 检查文件缓存是否存在

```http
GET /api/fileVectorCache/exists?fileUrl=https://example.com/file.pdf
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "cache": {
      "fileUrl": "https://example.com/file.pdf",
      "fileType": "user",
      "userId": 123,
      "chunkCount": 10,
      "vectorCount": 10
    }
  }
}
```

### 3. 删除指定文件的缓存

```http
DELETE /api/fileVectorCache/delete?fileUrl=https://example.com/file.pdf
```

**响应示例**:
```json
{
  "success": true,
  "message": "删除成功"
}
```

### 4. 删除指定用户的所有向量缓存

```http
DELETE /api/fileVectorCache/user/:userId
```

**示例**: `DELETE /api/fileVectorCache/user/123`

**响应示例**:
```json
{
  "success": true,
  "message": "成功删除 10 条向量缓存",
  "data": {
    "deletedCount": 10
  }
}
```

### 5. 手动清理过期缓存

```http
POST /api/fileVectorCache/clean
```

**响应示例**:
```json
{
  "success": true,
  "message": "清理完成，删除了 5 条过期缓存",
  "data": {
    "deletedCount": 5
  }
}
```

### 6. 保存系统文件向量（管理员上传永久文件）

```http
POST /api/fileVectorCache/saveSystemFile
Content-Type: application/json
```

**请求体**:
```json
{
  "fileUrl": "https://example.com/knowledge.pdf",
  "chunks": [
    "这是第一段文本...",
    "这是第二段文本..."
  ],
  "vectors": [
    [0.1, 0.2, 0.3, ...],
    [0.4, 0.5, 0.6, ...]
  ],
  "modelInfo": "text-embedding-ada-002",
  "fileContent": "完整的文件内容..."
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "系统文件向量保存成功（永久缓存）",
  "data": {
    "fileUrl": "https://example.com/knowledge.pdf",
    "chunkCount": 2,
    "vectorCount": 2,
    "fileType": "system",
    "expiresAt": null
  }
}
```

---

## 前端集成示例

### 管理端调用示例

```typescript
// 获取统计信息
const stats = await fetch('/api/fileVectorCache/stats', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
}).then(res => res.json());

// 检查文件缓存
const checkResult = await fetch('/api/fileVectorCache/exists?fileUrl=' + encodeURIComponent(fileUrl), {
  headers: {
    'Authorization': `Bearer ${token}`
  }
}).then(res => res.json());

// 删除用户缓存
const deleteResult = await fetch(`/api/fileVectorCache/user/${userId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
}).then(res => res.json());

// 保存系统文件
const saveResult = await fetch('/api/fileVectorCache/saveSystemFile', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    fileUrl: 'https://example.com/kb.pdf',
    chunks: textChunks,
    vectors: vectors,
    modelInfo: 'text-embedding-ada-002'
  })
}).then(res => res.json());
```

---

## 注意事项

1. **用户文件必须提供 userId**：保存 `user` 类型的文件时，`userId` 是必填项
2. **系统文件不需要 userId**：`system` 类型的文件会自动将 `userId` 设置为 `null`
3. **自动过期**：`user` 类型的文件会在指定天数后自动过期并被清理
4. **缓存键**：使用文件 URL 的 SHA256 哈希作为缓存键，确保唯一性
5. **幂等性**：多次保存相同的文件URL会覆盖旧缓存
