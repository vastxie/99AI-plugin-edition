<script setup lang="ts">
import { useGlobalStoreWithOut } from '@/store/modules/global'
import { Close } from '@icon-park/vue-next'
import { ref, watch } from 'vue'
// 引入PDF转Markdown库
import { useBasicLayout } from '@/hooks/useBasicLayout'
import pdf2md from '@opendocsg/pdf2md'
// 引入Excel处理库
import { markdownTable } from 'markdown-table'
import ExcelJS from 'exceljs'
// 引入Word处理库
import * as mammoth from 'mammoth'
import TurndownService from 'turndown'
// 引入PPTX处理库
import { parse } from 'pptxtojson'
// 引入编码检测库
import jschardet from 'jschardet'

const useGlobalStore = useGlobalStoreWithOut()

interface FileItem {
  name: string
  url: string
  type?: string
}

interface Props {
  dataBase64List: string[] // 上传文件的base64预览列表（包含图片和视频）
  fileList: File[] // 上传的文件列表（包含图片和视频）
  savedFiles: FileItem[] // 已保存的文件列表
  isSelectedApp: boolean // 是否选中了应用
  usingPlugin: any // 正在使用的插件
  selectedApp: any // 选中的应用
}

const props = defineProps<Props>()
const { isMobile } = useBasicLayout()
const emit = defineEmits<{
  (e: 'clearData', index: number, isSavedFile: boolean, fileType?: string): void
  (e: 'clearSelectApp'): void
}>()

// 视频现在存储在 dataBase64List 和 fileList 中，通过文件类型区分

// 记录正在转换的文件索引（PDF、Excel、Word或PPTX）
const convertingFileIndex = ref<number | null>(null)
// 记录已处理过的文件数量，用于检测新文件
const processedFileCount = ref(0)
// 记录当前正在预览的文件信息
const currentPreviewingFile = ref<{ index: number; isSaved: boolean } | null>(null)

const handleClearData = (index: number, isSavedFile: boolean, fileType?: string) => {
  // 检查被删除的文件是否正在预览
  if (
    currentPreviewingFile.value &&
    currentPreviewingFile.value.index === index &&
    currentPreviewingFile.value.isSaved === isSavedFile
  ) {
    // 关闭预览面板
    useGlobalStore.updateMarkdownPreviewer(false)
    currentPreviewingFile.value = null
  }

  emit('clearData', index, isSavedFile, fileType)
}

const handleClearSelectApp = () => {
  emit('clearSelectApp')
}

// 获取文件大小的辅助函数
const getFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 获取文件扩展名
const getFileExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot === -1) return '未知'
  return fileName.substring(lastDot + 1).toUpperCase()
}

// 从URL获取文件大小（仅用于显示估算）
const estimateFileSize = async (url: string): Promise<number> => {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentLength = response.headers.get('content-length')
    return contentLength ? parseInt(contentLength, 10) : 0
  } catch {
    return 0
  }
}

// 存储文件大小信息
const fileSizes = ref<Map<string, number>>(new Map())

// 判断文件是否为PDF
const isPdfFile = (fileName: string) => {
  return fileName.toLowerCase().endsWith('.pdf')
}

// 判断文件是否为Excel
const isExcelFile = (fileName: string) => {
  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.xlsx')
}

// 判断文件是否为Word文档
const isWordFile = (fileName: string) => {
  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.docx') || lowerName.endsWith('.doc')
}

// 判断文件是否为PPTX演示文稿
const isPptxFile = (fileName: string) => {
  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt')
}

// 判断文件是否为TXT文本文件
const isTxtFile = (fileName: string) => {
  return fileName.toLowerCase().endsWith('.txt')
}

// 判断文件是否为Markdown文件
const isMarkdownFile = (fileName: string) => {
  const lowerName = fileName.toLowerCase()
  return lowerName.endsWith('.md') || lowerName.endsWith('.markdown')
}

// 判断文件是否可以转换为Markdown（PDF、Excel、Word、PPTX、TXT、Markdown）
const isConvertibleFile = (fileName: string) => {
  return (
    isPdfFile(fileName) ||
    isExcelFile(fileName) ||
    isWordFile(fileName) ||
    isPptxFile(fileName) ||
    isTxtFile(fileName) ||
    isMarkdownFile(fileName)
  )
}

// 处理Excel文件转换为Markdown
const handleExcelToMarkdown = async (fileUrl: string) => {
  const response = await fetch(fileUrl)
  const arrayBuffer = await response.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(arrayBuffer)

  let markdownContent = ''

  // 遍历所有工作表
  workbook.eachSheet(worksheet => {
    const jsonData: unknown[][] = []
    worksheet.eachRow({ includeEmpty: false }, row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      jsonData.push(values)
    })

    // 如果有多个工作表，添加工作表标题
    if (workbook.worksheets.length > 1) {
      markdownContent += `## ${worksheet.name}\n\n`
    }

    // 过滤空行
    const filteredData = jsonData.filter((row: any) =>
      row.some((cell: any) => cell !== undefined && cell !== '')
    )

    if (filteredData.length > 0) {
      // 确保所有行都有相同的列数
      const maxCols = Math.max(...filteredData.map((row: any) => row.length))
      const normalizedData = filteredData.map((row: any) => {
        const normalizedRow = [...row]
        while (normalizedRow.length < maxCols) {
          normalizedRow.push('')
        }
        return normalizedRow.map(cell => (cell === undefined || cell === null ? '' : String(cell)))
      })

      // 转换为Markdown表格
      const table = markdownTable(normalizedData)
      markdownContent += table + '\n\n'
    }
  })

  return markdownContent
}

// 处理Word文件转换为Markdown
const handleWordToMarkdown = async (fileUrl: string) => {
  const response = await fetch(fileUrl)
  const arrayBuffer = await response.arrayBuffer()

  // 使用mammoth将docx转换为HTML
  const result = await mammoth.convertToHtml({ arrayBuffer })

  // 使用turndown将HTML转换为Markdown
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })

  const markdownContent = turndownService.turndown(result.value)

  return markdownContent
}

// 表格转换辅助函数
const convertTableToMarkdown = (tableData: any[][]) => {
  if (!tableData || tableData.length === 0) return ''

  let markdown = ''
  tableData.forEach((row, rowIndex) => {
    markdown += '| ' + row.map(cell => String(cell || '')).join(' | ') + ' |\n'
    if (rowIndex === 0) {
      // 添加表头分隔符
      markdown += '| ' + row.map(() => '---').join(' | ') + ' |\n'
    }
  })
  return markdown + '\n'
}

// 清理HTML标签，提取纯文本
const cleanHtmlContent = (htmlContent: string) => {
  if (!htmlContent) return ''

  // 移除HTML标签，保留文本内容
  let textContent = htmlContent.replace(/<[^>]*>/g, '')

  // 解码HTML实体
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = textContent
  textContent = tempDiv.textContent || tempDiv.innerText || ''

  // 清理多余的空白字符
  return textContent.trim().replace(/\s+/g, ' ')
}

// 实现PPTX JSON到Markdown的转换逻辑
const convertPptxJsonToMarkdown = (pptxJson: any) => {
  let markdown = `# 演示文稿\n\n`

  if (!pptxJson.slides || pptxJson.slides.length === 0) {
    return '# 演示文稿\n\n> 未能提取到幻灯片内容\n'
  }

  markdown += `> 总共 ${pptxJson.slides.length} 张幻灯片\n\n`

  pptxJson.slides.forEach((slide: any, index: number) => {
    markdown += `## 幻灯片 ${index + 1}\n\n`

    if (slide.elements && slide.elements.length > 0) {
      slide.elements.forEach((element: any) => {
        switch (element.type) {
          case 'text':
            if (element.content) {
              const textContent = cleanHtmlContent(element.content)
              if (textContent) {
                // 根据字体大小或位置判断是否为标题
                if (element.fontSize && element.fontSize > 18) {
                  markdown += `### ${textContent}\n\n`
                } else {
                  markdown += `${textContent}\n\n`
                }
              }
            }
            break

          case 'shape':
            if (element.content) {
              const textContent = cleanHtmlContent(element.content)
              if (textContent) {
                // 形状中的文本作为段落或引用
                if (element.shapType === 'rect' || element.shapType === 'roundRect') {
                  markdown += `> ${textContent}\n\n`
                } else {
                  markdown += `${textContent}\n\n`
                }
              }
            }
            break

          case 'table':
            if (element.data && element.data.length > 0) {
              markdown += convertTableToMarkdown(element.data)
            }
            break

          case 'image':
            if (element.src) {
              markdown += `![图片](${element.src})\n\n`
            }
            break

          case 'chart':
            markdown += `📊 **图表**: ${element.chartType || '未知类型'}\n\n`
            if (element.data) {
              markdown += '```\n'
              markdown += JSON.stringify(element.data, null, 2)
              markdown += '\n```\n\n'
            }
            break

          default:
            // 其他类型元素的通用处理
            if (element.content) {
              const textContent = cleanHtmlContent(element.content)
              if (textContent) {
                markdown += `${textContent}\n\n`
              }
            }
        }
      })
    } else {
      markdown += '> 此幻灯片无内容\n\n'
    }

    // 添加幻灯片分隔符
    if (index < pptxJson.slides.length - 1) {
      markdown += '---\n\n'
    }
  })

  return markdown
}

// 处理PPTX文件转换为Markdown
const handlePptxToMarkdown = async (fileUrl: string) => {
  const response = await fetch(fileUrl)
  const arrayBuffer = await response.arrayBuffer()
  const pptxJson = await parse(arrayBuffer)

  // 转换JSON为Markdown
  return convertPptxJsonToMarkdown(pptxJson)
}

// 处理TXT文件转换为Markdown
const handleTxtToMarkdown = async (fileUrl: string) => {
  const response = await fetch(fileUrl)
  const arrayBuffer = await response.arrayBuffer()

  // 使用Uint8Array处理二进制数据
  const uint8Array = new Uint8Array(arrayBuffer)

  let encoding = 'UTF-8'

  try {
    // 检测文件编码
    const detectionResult = jschardet.detect(uint8Array as any)

    if (detectionResult && typeof detectionResult === 'object') {
      encoding = detectionResult.encoding || 'UTF-8'
    }
  } catch (detectError) {
    // 编码检测失败，使用默认UTF-8
  }

  let textContent = ''

  try {
    // 根据检测到的编码进行解码
    if (encoding.toUpperCase().includes('UTF-8')) {
      // UTF-8编码
      textContent = new TextDecoder('utf-8').decode(uint8Array)
    } else if (encoding.toUpperCase().includes('GBK') || encoding.toUpperCase().includes('GB')) {
      // GBK/GB2312编码
      textContent = new TextDecoder('gbk').decode(uint8Array)
    } else if (
      encoding.toUpperCase().includes('SHIFT_JIS') ||
      encoding.toUpperCase().includes('SJIS')
    ) {
      // Shift_JIS编码
      textContent = new TextDecoder('shift_jis').decode(uint8Array)
    } else if (encoding.toUpperCase().includes('BIG5')) {
      // Big5编码
      textContent = new TextDecoder('big5').decode(uint8Array)
    } else if (encoding.toUpperCase().includes('ISO-8859')) {
      // ISO-8859系列编码
      textContent = new TextDecoder('iso-8859-1').decode(uint8Array)
    } else if (encoding.toUpperCase().includes('WINDOWS-1252')) {
      // Windows-1252编码
      textContent = new TextDecoder('windows-1252').decode(uint8Array)
    } else {
      // 默认尝试UTF-8
      textContent = new TextDecoder('utf-8').decode(uint8Array)
    }
  } catch (error) {
    // 解码失败，尝试UTF-8
    // 如果解码失败，尝试UTF-8
    try {
      textContent = new TextDecoder('utf-8').decode(uint8Array)
    } catch (utf8Error) {
      // UTF-8解码也失败，使用原始文本
      // 最后的fallback：手动处理字节数组
      textContent = Array.from(uint8Array)
        .map(byte => String.fromCharCode(byte))
        .join('')
    }
  }

  // 智能转换TXT为Markdown格式
  return convertTxtToMarkdown(textContent, encoding)
}

// 智能TXT转Markdown转换器
const convertTxtToMarkdown = (textContent: string, encoding?: string) => {
  if (!textContent) return '# 空文本文件'

  const lines = textContent.split('\n')
  let markdown = ''

  // 添加文件信息头部（如果有编码信息）
  if (encoding) {
    markdown += `# 文本文件内容\n\n> **检测编码**: ${encoding}\n\n`
  }

  let inCodeBlock = false
  let currentListLevel = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // 跳过空行但保留一个换行
    if (!trimmedLine) {
      if (markdown && !markdown.endsWith('\n\n')) {
        markdown += '\n'
      }
      continue
    }

    // 检测标题：连续大写字母或以数字+点开头，且下一行是分隔符
    const nextLine = lines[i + 1]?.trim()
    const isTitle =
      // 全大写标题
      (trimmedLine.length > 2 &&
        trimmedLine === trimmedLine.toUpperCase() &&
        /^[A-Z\s\d]+$/.test(trimmedLine)) ||
      // 下一行是分隔符的标题
      (nextLine && (nextLine.match(/^[=-]{3,}$/) || nextLine.match(/^[*#]{3,}$/))) ||
      // 数字编号标题
      /^\d+[.)]\s+[A-Z]/.test(trimmedLine) ||
      // 罗马数字标题
      /^[IVX]+[.)]\s+/.test(trimmedLine)

    if (isTitle) {
      // 检测标题级别
      let level = 1
      if (/^\d+[.)]/.test(trimmedLine)) level = 2
      if (/^[a-z]\)/.test(trimmedLine)) level = 3

      const titleText = trimmedLine.replace(/^(\d+[.)]|\w+[.)])\s*/, '')
      markdown += `${'#'.repeat(level)} ${titleText}\n\n`

      // 跳过下一行的分隔符
      if (nextLine && nextLine.match(/^[=\-*#]{3,}$/)) {
        i++
      }
      continue
    }

    // 检测列表项
    const listMatch =
      trimmedLine.match(/^(\s*)[-*+•]\s+(.+)$/) || trimmedLine.match(/^(\s*)\d+[.)]\s+(.+)$/)

    if (listMatch) {
      const indent = listMatch[1].length
      const content = listMatch[2]
      const isNumbered = /^\s*\d+[.)]/.test(trimmedLine)

      // 计算列表级别
      const level = Math.floor(indent / 2)

      if (level > currentListLevel) {
        currentListLevel = level
      } else if (level < currentListLevel) {
        currentListLevel = level
      }

      const prefix = '  '.repeat(level) + (isNumbered ? '1. ' : '- ')
      markdown += `${prefix}${content}\n`
      continue
    } else {
      currentListLevel = 0
    }

    // 检测代码块（缩进4个空格或以特殊字符开头）
    const isCodeLine =
      line.startsWith('    ') ||
      line.startsWith('\t') ||
      /^[\s]*[{}();]/.test(line) ||
      /^[\s]*#include|import |function |def |class |var |let |const /.test(line)

    if (isCodeLine && !inCodeBlock) {
      markdown += '```\n'
      inCodeBlock = true
    } else if (!isCodeLine && inCodeBlock) {
      markdown += '```\n\n'
      inCodeBlock = false
    }

    if (inCodeBlock) {
      markdown += line + '\n'
    } else {
      // 检测引用（以>开头或缩进且以引号开头）
      if (trimmedLine.startsWith('>') || (line.startsWith('  ') && /^[""]/.test(trimmedLine))) {
        const quoteText = trimmedLine.replace(/^>\s*/, '').replace(/^[""]/, '').replace(/[""]$/, '')
        markdown += `> ${quoteText}\n\n`
        continue
      }

      // 检测分隔线
      if (trimmedLine.match(/^[=\-*]{3,}$/)) {
        markdown += '---\n\n'
        continue
      }

      // 检测表格（包含多个 | 分隔符）
      if (trimmedLine.includes('|') && trimmedLine.split('|').length >= 3) {
        markdown += trimmedLine + '\n'
        // 检查下一行是否需要添加表格分隔符
        const nextLineContent = lines[i + 1]?.trim()
        if (nextLineContent && !nextLineContent.includes('|')) {
          const cols = trimmedLine.split('|').length - 1
          markdown += '|' + ' --- |'.repeat(cols) + '\n'
        }
        continue
      }

      // 检测网址
      const urlPattern = /(https?:\/\/[^\s]+)/g
      let formattedLine = trimmedLine.replace(urlPattern, '[$1]($1)')

      // 检测邮箱
      const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
      formattedLine = formattedLine.replace(emailPattern, '[$1](mailto:$1)')

      // 普通段落
      markdown += formattedLine + '\n\n'
    }
  }

  // 关闭未关闭的代码块
  if (inCodeBlock) {
    markdown += '```\n'
  }

  // 清理多余的空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim()

  return markdown || '# 文本内容\n\n无法解析的文本内容'
}

// 处理Markdown文件直接预览
const handleMarkdownPreview = async (fileUrl: string) => {
  const response = await fetch(fileUrl)
  const markdownContent = await response.text()

  return markdownContent
}

// 处理文件点击 - 支持PDF、Excel、Word、PPTX、TXT和Markdown转换或预览
const handleFileClick = async (
  fileUrl: string,
  fileName: string,
  index: number,
  isSaved: boolean = true
) => {
  // 如果已经在转换中，则不重复操作
  if (convertingFileIndex.value !== null) {
    return
  }

  try {
    // 设置当前正在转换的文件索引
    convertingFileIndex.value = index

    // 记录正在预览的文件信息
    currentPreviewingFile.value = { index, isSaved }

    let markdownContent = ''

    if (isPdfFile(fileName)) {
      // 处理PDF文件
      const response = await fetch(fileUrl)
      const pdfBuffer = await response.arrayBuffer()
      markdownContent = await pdf2md(pdfBuffer)
    } else if (isExcelFile(fileName)) {
      // 处理Excel文件
      markdownContent = await handleExcelToMarkdown(fileUrl)
    } else if (isWordFile(fileName)) {
      // 处理Word文件
      markdownContent = await handleWordToMarkdown(fileUrl)
    } else if (isPptxFile(fileName)) {
      // 处理PPTX文件
      markdownContent = await handlePptxToMarkdown(fileUrl)
    } else if (isTxtFile(fileName)) {
      // 处理TXT文件
      markdownContent = await handleTxtToMarkdown(fileUrl)
    } else if (isMarkdownFile(fileName)) {
      // 处理Markdown文件
      markdownContent = await handleMarkdownPreview(fileUrl)
    }

    // 转换完成后，更新全局状态，打开Markdown预览器
    useGlobalStore.updateMarkdownPreviewer(true, markdownContent)

    // 转换成功提示
    // ms.success('文件已转换为Markdown')
  } catch (error) {
    // File to Markdown conversion failed
  } finally {
    // 重置转换状态
    convertingFileIndex.value = null
  }
}

// 监听savedFiles变化，自动处理新上传的文件
watch(
  () => props.savedFiles,
  async newFiles => {
    // 检查是否有新文件添加
    if (newFiles.length > processedFileCount.value) {
      // 获取新添加的文件
      const newFile = newFiles[newFiles.length - 1]

      // 如果新文件是可转换文件（PDF、Excel、Word、PPTX、TXT、Markdown）且不在移动端，自动转换
      if (newFile && isConvertibleFile(newFile.name) && !isMobile.value) {
        const fileIndex = newFiles.length - 1
        handleFileClick(newFile.url, newFile.name, fileIndex, true)
      }

      // 获取新文件的大小
      if (newFile && newFile.type === 'document') {
        const size = await estimateFileSize(newFile.url)
        if (size > 0) {
          fileSizes.value.set(newFile.url, size)
        }
      }

      // 更新已处理文件数量
      processedFileCount.value = newFiles.length
    } else if (newFiles.length < processedFileCount.value) {
      // 文件被删除时，更新计数
      processedFileCount.value = newFiles.length
    }
  },
  { immediate: true, deep: true }
)

// 监听预览器关闭，清除当前预览文件记录
watch(
  () => useGlobalStore.isMarkdownPreviewerVisible,
  isVisible => {
    if (!isVisible) {
      currentPreviewingFile.value = null
    }
  }
)
</script>

<template>
  <div
    v-if="dataBase64List.length > 0 || savedFiles.length > 0 || isSelectedApp || usingPlugin"
    class="self-start w-full select-none"
  >
    <!-- 上传的文件和图片显示区域 -->
    <div class="self-start w-full rounded-t-2xl mt-2">
      <!-- 选中的应用 -->
      <div v-if="usingPlugin || isSelectedApp" class="relative w-full">
        <div
          v-if="usingPlugin"
          class="flex px-2 bg-opacity dark:bg-gray-750 rounded-b-md rounded-t-2xl items-center justify-start h-12 text-gray-700 dark:text-gray-400 shadow-sm"
        >
          <div
            class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
          >
            <img
              v-if="usingPlugin.pluginImg"
              :src="usingPlugin.pluginImg"
              alt="Cover Image"
              class="w-8 h-8 rounded-full flex justify-start"
            />
            <span
              v-else
              class="w-8 h-8 text-base font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
            >
              {{ usingPlugin.pluginName.charAt(0) }}
            </span>
          </div>

          <h3
            class="text-md font-bold text-gray-700 dark:text-gray-400 mr-3 flex-shrink-0 flex justify-start"
          >
            {{ usingPlugin.pluginName }}
          </h3>
          <p class="text-base text-gray-400 dark:text-gray-400 truncate pr-10">
            {{ usingPlugin.description }}
          </p>

          <div
            class="absolute top-1/2 right-4 transform -translate-y-1/2 cursor-pointer text-gray-300 hover:text-gray-500"
            @click="handleClearSelectApp()"
          >
            <Close size="18" class="rounded-full" />
          </div>
        </div>

        <div
          v-if="isSelectedApp && !usingPlugin"
          class="flex px-2 bg-opacity dark:bg-gray-750 rounded-b-md rounded-t-2xl items-center justify-start h-12 text-gray-700 dark:text-gray-400 shadow-sm"
        >
          <div
            class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
          >
            <img
              v-if="selectedApp.coverImg"
              :src="selectedApp.coverImg"
              alt="Cover Image"
              class="w-8 h-8 rounded-full flex justify-start"
            />
            <span
              v-else
              class="w-8 h-8 text-base font-medium text-gray-700 dark:text-gray-400 rounded-full flex items-center justify-center dark:bg-gray-700"
            >
              {{ selectedApp.name.charAt(0) }}
            </span>
          </div>

          <h3
            class="text-md font-bold text-gray-600 dark:text-gray-400 mr-3 flex-shrink-0 flex justify-start"
          >
            {{ selectedApp.name }}
          </h3>
          <p class="text-base text-gray-400 dark:text-gray-400 truncate pr-10">
            {{ selectedApp.des }}
          </p>

          <div
            class="absolute top-1/2 right-4 transform -translate-y-1/2 cursor-pointer text-gray-300 hover:text-gray-500"
            @click="handleClearSelectApp()"
          >
            <Close size="18" class="rounded-full" />
          </div>
        </div>
      </div>

      <div class="flex flex-wrap px-2">
        <!-- 已保存的文件显示 -->
        <template v-if="savedFiles.length > 0">
          <!-- 先显示图片 -->
          <div
            class="group relative inline-block mr-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'image')"
            :key="'saved-img-' + index"
          >
            <div
              class="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <img :src="file.url" class="w-full h-full object-cover" alt="预览图片" />
              <!-- 美化的关闭按钮 -->
              <div
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                  @click.stop="handleClearData(savedFiles.indexOf(file), true)"
                >
                  <Close theme="outline" size="14" :strokeWidth="3" />
                </button>
              </div>
            </div>
          </div>

          <!-- 再显示文件 -->
          <div
            class="relative inline-block mr-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'document')"
            :key="'saved-file-' + index"
          >
            <div
              class="group relative px-3 h-16 flex flex-col justify-center rounded-xl min-w-[120px] max-w-[200px] text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all"
              :class="{
                'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-200 dark:hover:border-gray-600':
                  isConvertibleFile(file.name),
              }"
              @click="
                isConvertibleFile(file.name) && !isMobile
                  ? handleFileClick(file.url, file.name, savedFiles.indexOf(file), true)
                  : null
              "
              :title="
                isConvertibleFile(file.name)
                  ? isPdfFile(file.name)
                    ? '点击预览PDF文件'
                    : isExcelFile(file.name)
                      ? '点击预览Excel文件'
                      : isWordFile(file.name)
                        ? '点击预览Word文件'
                        : isPptxFile(file.name)
                          ? '点击预览PPTX文件'
                          : isTxtFile(file.name)
                            ? '点击预览TXT文件'
                            : isMarkdownFile(file.name)
                              ? '点击预览Markdown文件'
                              : '点击预览文件'
                  : file.name
              "
            >
              <!-- 统一加载指示器 - 处理文件转换加载状态 -->
              <div
                v-if="convertingFileIndex === savedFiles.indexOf(file)"
                class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 dark:bg-gray-800 dark:bg-opacity-80 rounded-xl z-10"
              >
                <div class="loading-animation">
                  <span></span>
                </div>
              </div>

              <!-- 文件名称 -->
              <div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate pr-6">
                {{ file.name }}
              </div>

              <!-- 文件类型和大小 -->
              <div
                class="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500 dark:text-gray-500"
              >
                <span class="uppercase">{{ getFileExtension(file.name) }}</span>
                <span v-if="fileSizes.get(file.url)" class="text-gray-400 dark:text-gray-600"
                  >•</span
                >
                <span v-if="fileSizes.get(file.url)">{{
                  getFileSize(fileSizes.get(file.url) || 0)
                }}</span>
              </div>

              <!-- 美化的关闭按钮 -->
              <div
                v-if="convertingFileIndex !== savedFiles.indexOf(file)"
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                  @click.stop="handleClearData(savedFiles.indexOf(file), true)"
                >
                  <Close theme="outline" size="14" :strokeWidth="3" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 只显示图片预览，不显示文件预览（因为文件已立即上传） -->
        <template
          v-if="dataBase64List.length > 0"
          v-for="(base64, index) in dataBase64List"
          :key="'item-' + index"
        >
          <div
            v-if="fileList[index]?.type.startsWith('image/')"
            class="group relative inline-block mr-2"
          >
            <div
              class="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <img :src="base64" class="w-full h-full object-cover" alt="预览图片" />
              <!-- 美化的关闭按钮 -->
              <div
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                  @click.stop="handleClearData(index, false)"
                >
                  <Close theme="outline" size="14" :strokeWidth="3" />
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 显示缓存中的视频预览 -->
        <template
          v-if="dataBase64List.length > 0"
          v-for="(base64, index) in dataBase64List"
          :key="'video-item-' + index"
        >
          <div
            v-if="fileList[index]?.type.startsWith('video/')"
            class="group relative inline-block mr-2"
          >
            <div
              class="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              <video :src="base64" class="w-full h-full object-cover" muted preload="metadata" />
              <!-- 视频播放图标覆盖层 -->
              <div
                class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 pointer-events-none"
              >
                <svg class="w-5 h-5 text-white opacity-90" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"
                  />
                </svg>
              </div>
              <!-- 美化的关闭按钮 -->
              <div
                class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                  @click.stop="handleClearData(index, false)"
                >
                  <Close theme="outline" size="14" :strokeWidth="3" />
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 三点加载动画 */
.loading-animation {
  display: inline-block;
  position: relative;
  width: 60px;
  height: 20px;
}

.loading-animation:before,
.loading-animation:after,
.loading-animation span {
  content: '';
  display: block;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #6366f1;
  animation: dotBounce 1.4s infinite ease-in-out;
}

.loading-animation:before {
  left: 0;
  animation-delay: 0s;
}

.loading-animation span {
  left: 26px;
  animation-delay: 0.2s;
}

.loading-animation:after {
  left: 52px;
  animation-delay: 0.4s;
}

@keyframes dotBounce {
  0%,
  80%,
  100% {
    transform: translateY(-50%) scale(0.6);
    opacity: 0.6;
  }
  40% {
    transform: translateY(-50%) scale(1);
    opacity: 1;
  }
}
</style>
