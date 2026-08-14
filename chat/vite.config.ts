import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import type { ConfigEnv, UserConfig } from 'vite'
import { loadEnv } from 'vite'

/**
 * Vite 配置 - 使用最简单的原生配置
 * 避免复杂的自定义优化导致的初始化问题
 */
export default ({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd())

  return {
    base: env.VITE_BASE_PATH || '/',

    plugins: [vue()],

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@api': resolve(__dirname, 'src/api'),
        '@components': resolve(__dirname, 'src/components'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@views': resolve(__dirname, 'src/views'),
        '@store': resolve(__dirname, 'src/store'),
        '@hooks': resolve(__dirname, 'src/hooks'),
      },
    },

    server: {
      port: 9002,
      open: false,
      host: '0.0.0.0',
      proxy: {
        '^/api': {
          target: env.VITE_APP_API_BASE_URL || 'http://localhost:9520',
          changeOrigin: true,
        },
      },
    },

    build: {
      // 使用 Vite 默认配置
      target: 'es2015',
      outDir: 'dist',
      // 使用 terser 进行压缩，但完全禁用变量名混淆
      minify: 'terser',
      terserOptions: {
        compress: {
          // 只做压缩，不做代码优化
          drop_console: false,
          drop_debugger: false,
          pure_funcs: [],
          // 保留所有函数
          keep_fargs: true,
          keep_fnames: true,
        },
        mangle: false, // 完全禁用变量名混淆
        format: {
          // 保留注释
          comments: false,
        },
      },
      // 禁用报告压缩大小（加快构建）
      reportCompressedSize: false,
      // 不自定义 rollupOptions，让 Vite 自动处理
      rollupOptions: {
        output: {
          // 只保留最基本的文件分类
          assetFileNames: assetInfo => {
            const info = assetInfo.name?.split('.')
            let extname = info?.[info.length - 1]
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(assetInfo.name || '')) {
              extname = 'images'
            } else if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
              extname = 'fonts'
            } else if (/\.css$/i.test(assetInfo.name || '')) {
              extname = 'css'
            }
            return `${extname}/[name]-[hash][extname]`
          },
        },
      },
    },

    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'mitt'],
    },
  }
}
