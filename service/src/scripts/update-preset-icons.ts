import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

// 图标映射表
const iconMapping = {
  Document: 'ri:file-text-line',
  Code: 'ri:code-s-slash-line',
  Database: 'ri:database-2-line',
  CreditCard: 'ri:bank-card-line',
  Email: 'ri:mail-line',
  List: 'ri:file-list-3-line',
  Sport: 'ri:run-line',
  Food: 'ri:restaurant-line',
  Travel: 'ri:map-pin-line',
  Translate: 'ri:translate',
  Question: 'ri:question-line',
  Edit: 'ri:edit-line',
  Message: 'ri:message-2-line',
  Home: 'ri:home-line',
  Star: 'ri:star-line',
  Heart: 'ri:heart-line',
  Trophy: 'ri:trophy-line',
  Flag: 'ri:flag-line',
  Bell: 'ri:notification-line',
  Lock: 'ri:lock-line',
  Unlock: 'ri:lock-unlock-line',
  View: 'ri:eye-line',
  Download: 'ri:download-line',
  Upload: 'ri:upload-line',
  Share: 'ri:share-line',
  Link: 'ri:link',
  Search: 'ri:search-line',
  Setting: 'ri:settings-3-line',
  House: 'ri:home-line',
  User: 'ri:user-line',
  Tools: 'ri:tools-line',
  Briefcase: 'ri:briefcase-line',
  School: 'ri:school-line',
  Reading: 'ri:book-read-line',
  Notebook: 'ri:book-open-line',
  Files: 'ri:file-list-3-line',
  FolderOpened: 'ri:folder-open-line',
};

// 颜色映射表
const colorMapping = {
  '#409EFF': 'text-blue-500',
  '#67C23A': 'text-green-500',
  '#E6A23C': 'text-yellow-500',
  '#F56C6C': 'text-red-500',
  '#909399': 'text-gray-500',
  '#00C48F': 'text-emerald-500',
  '#FF6B6B': 'text-pink-500',
  '#845EC2': 'text-purple-500',
  '#4E8FF7': 'text-sky-500',
  '#FFC75F': 'text-orange-500',
};

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    console.log('开始更新预设图标和颜色...\n');

    // 更新预设表的图标
    console.log('=== 更新预设图标 ===');
    for (const [oldIcon, newIcon] of Object.entries(iconMapping)) {
      const result = await dataSource.query('UPDATE presets SET icon = ? WHERE icon = ?', [
        newIcon,
        oldIcon,
      ]);
      if (result.affectedRows > 0) {
        console.log(`✓ 更新预设图标: ${oldIcon} → ${newIcon} (${result.affectedRows} 条记录)`);
      }
    }

    // 更新预设表的颜色
    console.log('\n=== 更新预设颜色 ===');
    for (const [oldColor, newColor] of Object.entries(colorMapping)) {
      const result = await dataSource.query(
        'UPDATE presets SET iconColor = ? WHERE iconColor = ?',
        [newColor, oldColor],
      );
      if (result.affectedRows > 0) {
        console.log(`✓ 更新预设颜色: ${oldColor} → ${newColor} (${result.affectedRows} 条记录)`);
      }
    }

    // 更新预设分类表的图标
    console.log('\n=== 更新分类图标 ===');
    for (const [oldIcon, newIcon] of Object.entries(iconMapping)) {
      const result = await dataSource.query(
        'UPDATE preset_categories SET icon = ? WHERE icon = ?',
        [newIcon, oldIcon],
      );
      if (result.affectedRows > 0) {
        console.log(`✓ 更新分类图标: ${oldIcon} → ${newIcon} (${result.affectedRows} 条记录)`);
      }
    }

    // 更新预设分类表的颜色
    console.log('\n=== 更新分类颜色 ===');
    for (const [oldColor, newColor] of Object.entries(colorMapping)) {
      const result = await dataSource.query(
        'UPDATE preset_categories SET iconColor = ? WHERE iconColor = ?',
        [newColor, oldColor],
      );
      if (result.affectedRows > 0) {
        console.log(`✓ 更新分类颜色: ${oldColor} → ${newColor} (${result.affectedRows} 条记录)`);
      }
    }

    // 显示更新后的数据
    console.log('\n=== 更新后的预设 ===');
    const presets = await dataSource.query(
      'SELECT id, title, icon, iconColor FROM presets ORDER BY id',
    );
    presets.forEach((preset: any) => {
      console.log(
        `ID: ${preset.id} | ${preset.title} | 图标: ${preset.icon} | 颜色: ${preset.iconColor}`,
      );
    });

    console.log('\n=== 更新后的分类 ===');
    const categories = await dataSource.query(
      'SELECT id, name, icon, iconColor FROM preset_categories ORDER BY id',
    );
    categories.forEach((cat: any) => {
      console.log(`ID: ${cat.id} | ${cat.name} | 图标: ${cat.icon} | 颜色: ${cat.iconColor}`);
    });

    console.log('\n✅ 所有更新完成！');
  } catch (error) {
    console.error('❌ 更新失败:', error.message);
  } finally {
    await app.close();
  }
}

bootstrap();
