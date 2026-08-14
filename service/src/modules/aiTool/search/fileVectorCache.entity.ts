import { BaseEntity } from 'src/common/entity/baseEntity';
import { Column, Entity, Index } from 'typeorm';

/**
 * 文件向量缓存实体
 * 用于存储文件的向量化结果，避免重复计算
 */
@Entity({ name: 'file_vector_cache' })
export class FileVectorCacheEntity extends BaseEntity {
  @Column({ unique: true, length: 64, comment: '文件URL的SHA256哈希' })
  fileHash: string;

  @Column({ type: 'text', comment: '原始文件URL' })
  fileUrl: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '原始文件名（用户上传时的文件名）',
  })
  originalFileName: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: '数据库大小（格式化字符串，如 "1.23 MB"）',
  })
  dbSize: string;

  @Column({ type: 'mediumtext', nullable: true, comment: '提取的文本内容' })
  fileContent: string;

  @Column({ type: 'json', comment: '文本分块数组' })
  chunks: any;

  @Column({ type: 'json', comment: '向量化结果数组' })
  vectors: any;

  @Column({ length: 200, nullable: true, comment: '使用的向量化模型' })
  modelInfo: string;

  @Column({
    type: 'enum',
    enum: ['user', 'system'],
    default: 'user',
    comment: '文件类型：user-用户文件（短期缓存），system-系统文件（永久缓存）',
  })
  @Index()
  fileType: 'user' | 'system';

  @Column({ type: 'timestamp', nullable: true, comment: '过期时间，NULL表示永不过期' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'int', nullable: true, comment: '关联的用户ID（user类型时必填）' })
  @Index()
  userId: number;
}
