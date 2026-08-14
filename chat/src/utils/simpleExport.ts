import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { convertMarkdownToDocx, downloadDocx, type Options } from '@mohtasham/md-to-docx'

// 导出为Word文档 - 使用新的 Markdown 直接转 DOCX
export async function exportToWord(markdownContent: string, filename: string) {
  try {
    // 配置选项
    const options: Options = {
      style: {
        // 标题字体大小
        tocHeading1FontSize: 28,
        tocHeading2FontSize: 24,
        tocHeading3FontSize: 20,
        tocHeading4FontSize: 18,
        tocHeading5FontSize: 16,

        // 加粗标题
        tocHeading1Bold: true,
        tocHeading2Bold: true,
        tocHeading3Bold: true,
        tocHeading4Bold: true,
        tocHeading5Bold: true,

        // 其他样式配置
        tocHeading1Italic: false,
        tocHeading2Italic: false,
        tocHeading3Italic: false,
        tocHeading4Italic: false,
        tocHeading5Italic: false,

        // 字体设置
        fontFamily: 'Microsoft YaHei',

        // 段落间距
        paragraphSpacing: 120,

        // 行间距
        lineSpacing: 1.5,
      },
      template: {
        page: {
          margin: {
            top: 1000, // 顶部边距
            right: 1000, // 右边距
            bottom: 1000, // 底部边距
            left: 1000, // 左边距
          },
        },
      },
    }

    // 将 Markdown 转换为 DOCX
    const blob = await convertMarkdownToDocx(markdownContent, options)

    // 下载文件
    downloadDocx(blob, `${filename}.docx`)

    return true
  } catch (error) {
    throw new Error('导出 Word 文档失败，请重试', { cause: error })
  }
}

// 导出为PDF文档（简单版本）
export async function exportToPdf(htmlContent: string, filename: string) {
  // 创建临时容器
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '210mm' // A4宽度
  container.style.padding = '20mm'
  container.style.background = 'white'
  container.innerHTML = htmlContent

  // 添加样式
  const style = document.createElement('style')
  style.textContent = `
    ${container.id} {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      line-height: 1.8;
      color: #333;
    }
    ${container.id} h1 { font-size: 24px; margin: 20px 0; }
    ${container.id} h2 { font-size: 20px; margin: 18px 0; }
    ${container.id} h3 { font-size: 18px; margin: 16px 0; }
    ${container.id} p { margin: 12px 0; }
    ${container.id} pre { 
      background: #f5f5f5; 
      padding: 12px; 
      overflow-x: auto;
      border-radius: 4px;
    }
    ${container.id} code { 
      background: #f5f5f5; 
      padding: 2px 6px; 
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    ${container.id} blockquote { 
      border-left: 4px solid #ddd; 
      margin: 16px 0; 
      padding-left: 20px;
      color: #666;
    }
    ${container.id} ul, ${container.id} ol { margin: 12px 0; padding-left: 30px; }
    ${container.id} li { margin: 6px 0; }
    ${container.id} table { 
      border-collapse: collapse; 
      width: 100%; 
      margin: 16px 0;
    }
    ${container.id} th, ${container.id} td { 
      border: 1px solid #ddd; 
      padding: 8px 12px;
      text-align: left;
    }
    ${container.id} th { background: #f5f5f5; font-weight: bold; }
    ${container.id} img { max-width: 100%; height: auto; }
  `

  document.head.appendChild(style)
  document.body.appendChild(container)

  try {
    // 使用html2canvas生成图片
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })

    // 计算PDF尺寸
    const imgWidth = 210 // A4宽度（mm）
    const pageHeight = 297 // A4高度（mm）
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight

    // 创建PDF
    const pdf = new jsPDF('p', 'mm', 'a4')
    let position = 0

    // 添加图片到PDF
    const imgData = canvas.toDataURL('image/png')

    if (heightLeft < pageHeight) {
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    } else {
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, pageHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
    }

    // 保存PDF
    pdf.save(`${filename}.pdf`)
  } finally {
    // 清理
    document.body.removeChild(container)
    document.head.removeChild(style)
  }
}
