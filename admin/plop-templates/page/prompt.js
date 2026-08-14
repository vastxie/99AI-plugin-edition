import path from 'node:path'
import fs from 'node:fs'

function getFolder(folderPath) {
  const components = []
  const files = fs.readdirSync(folderPath)
  files.forEach((item) => {
    const stat = fs.lstatSync(`${folderPath}/${item}`)
    if (stat.isDirectory() === true && item !== 'components') {
      components.push(`${folderPath}/${item}`)
      components.push(...getFolder(`${folderPath}/${item}`))
    }
  })
  return components
}

export default {
  description: '创建页面',
  prompts: [
    {
      type: 'list',
      name: 'path',
      message: '请选择页面创建目录',
      choices: getFolder('src/views'),
    },
    {
      type: 'input',
      name: 'name',
      message: '请输入文件名',
      validate: (v) => {
        if (!v || v.trim === '') {
          return '文件名不能为空'
        }
        return true
      },
    },
    {
      type: 'confirm',
      name: 'isFilesystem',
      message: '是否为基于文件系统的路由页面',
      default: false,
    },
  ],
  actions: (data) => {
    const relativePath = path.relative('src/views', data.path)
    const actions = [
      {
        type: 'add',
        path: `${data.path}/{{dotCase name}}.vue`,
        templateFile: 'plop-templates/page/index.hbs',
        data: {
          componentName: `${relativePath} ${data.name}`,
        },
      },
    ]
    return actions
  },
}
