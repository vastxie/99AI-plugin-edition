import svgSpritePlugin from 'vite-plugin-svg-sprite'

export default function createSvgIcon(isBuild) {
  return svgSpritePlugin({
    exportType: 'vanilla',
    include: '**/src/assets/icons/*.svg',
    symbolId: 'icon-[name]',
    svgo: isBuild ? {} : false,
  })
}
