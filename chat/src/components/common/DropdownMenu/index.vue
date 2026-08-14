<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'

// 定义位置类型，添加auto选项
type Position =
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'auto'

interface Props {
  // 菜单是否打开
  modelValue?: boolean
  // 触发方式：click 或 hover
  trigger?: 'click' | 'hover'
  // 菜单位置
  position?: Position
  // 最大高度
  maxHeight?: string
  // 最小宽度
  minWidth?: string
  // 是否禁用
  disabled?: boolean
  // 自定义菜单样式类
  menuClass?: string
  // 自定义触发器样式类
  triggerClass?: string
  // 点击外部是否关闭
  closeOnClickOutside?: boolean
  // 按下ESC是否关闭
  closeOnEscape?: boolean
  // z-index值
  zIndex?: number
  // 悬停延迟时间（毫秒）
  hoverDelay?: number
  // 悬停离开后自动关闭的延迟时间（毫秒），0 表示不自动关闭
  hoverCloseDelay?: number
  // 是否将菜单浮层渲染到 body，避免被滚动容器裁剪
  teleport?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  trigger: 'click',
  position: 'bottom-left',
  maxHeight: '60vh',
  minWidth: '200px',
  disabled: false,
  menuClass: '',
  triggerClass: '',
  closeOnClickOutside: true,
  closeOnEscape: true,
  zIndex: 50,
  hoverDelay: 150,
  hoverCloseDelay: 0,
  teleport: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: []
  close: []
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const menuRef = ref<HTMLElement>()
const triggerRef = ref<HTMLElement>()
const teleportedMenuStyle = ref<CSSProperties>({})
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let floatingListenersAttached = false

// 自动检测位置的响应式变量
const autoPosition = ref<Exclude<Position, 'auto'>>('bottom-left')

// 检测位置函数
const detectPosition = () => {
  if (props.position !== 'auto' || !triggerRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const viewportHeight = window.innerHeight

  // 计算触发器相对于视口的垂直位置
  const triggerCenterY = triggerRect.top + triggerRect.height / 2

  // 只检测垂直方向：如果触发器在屏幕上半部分，向下展开；否则向上展开
  const isTopHalf = triggerCenterY < viewportHeight / 2
  const verticalDirection = isTopHalf ? 'bottom' : 'top'

  // 水平方向固定使用right对齐
  const horizontalDirection = 'right'

  // 组合最终位置
  const newPosition = `${verticalDirection}-${horizontalDirection}` as Exclude<Position, 'auto'>
  autoPosition.value = newPosition

  // 添加调试信息（开发时可用）
  if (process.env.NODE_ENV === 'development') {
  }
}

// 计算最终位置
const finalPosition = computed(() => {
  if (props.position === 'auto') {
    return autoPosition.value
  }
  return props.position || 'bottom-left'
})

// 计算位置样式类，使用finalPosition而不是props.position
const positionClasses = computed(() => {
  const position = finalPosition.value
  const classes = {
    'bottom-left': 'menu-items-bottom',
    'bottom-right': 'menu-items-bottom menu-items-right-aligned',
    'bottom-center': 'menu-items-bottom menu-items-center',
    'top-left': 'menu-items-top',
    'top-right': 'menu-items-top menu-items-right-aligned',
    'top-center': 'menu-items-top menu-items-center',
  }
  return classes[position] || classes['bottom-left']
})

// 菜单样式类 - 使用全局CSS类
const menuClasses = computed(() => {
  const baseClasses = [
    'menu-items',
    'custom-scrollbar',
    props.teleport ? 'menu-items-teleported' : positionClasses.value,
    props.menuClass,
  ]
  return baseClasses.filter(Boolean).join(' ')
})

const menuStyles = computed<CSSProperties>(() => ({
  maxHeight: props.maxHeight,
  minWidth: props.minWidth,
  zIndex: props.zIndex,
  overflowY: 'auto',
  ...teleportedMenuStyle.value,
}))

const updateTeleportedPosition = async () => {
  if (!props.teleport || !triggerRef.value || !isOpen.value) return

  await nextTick()

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const menuElement = menuRef.value
  const menuWidth = menuElement?.offsetWidth || triggerRect.width
  const menuHeight = menuElement?.offsetHeight || 0
  const position = finalPosition.value
  const gap = 8
  const viewportPadding = 8

  let top =
    position.startsWith('top') && menuHeight
      ? triggerRect.top - menuHeight - gap
      : triggerRect.bottom + gap

  let left = triggerRect.left
  if (position.endsWith('right')) {
    left = triggerRect.right - menuWidth
  } else if (position.endsWith('center')) {
    left = triggerRect.left + triggerRect.width / 2 - menuWidth / 2
  }

  const maxLeft = window.innerWidth - menuWidth - viewportPadding
  left = Math.min(Math.max(left, viewportPadding), Math.max(maxLeft, viewportPadding))

  if (menuHeight) {
    const maxTop = window.innerHeight - menuHeight - viewportPadding
    top = Math.min(Math.max(top, viewportPadding), Math.max(maxTop, viewportPadding))
  } else {
    top = Math.max(top, viewportPadding)
  }

  teleportedMenuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    right: 'auto',
    bottom: 'auto',
    margin: 0,
  }
}

const addFloatingListeners = () => {
  if (!props.teleport || floatingListenersAttached) return
  floatingListenersAttached = true
  window.addEventListener('resize', updateTeleportedPosition)
  window.addEventListener('scroll', updateTeleportedPosition, true)
}

const removeFloatingListeners = () => {
  if (!floatingListenersAttached) return
  floatingListenersAttached = false
  window.removeEventListener('resize', updateTeleportedPosition)
  window.removeEventListener('scroll', updateTeleportedPosition, true)
}

// 切换菜单状态
const toggleMenu = () => {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

// 打开菜单
function open() {
  if (props.disabled) return
  isOpen.value = true
}

// 关闭菜单
function close() {
  isOpen.value = false
}

// 处理点击触发器
const handleTriggerClick = () => {
  if (props.trigger === 'click') {
    toggleMenu()
  }
  // hover 模式下不处理点击
}

// 处理鼠标进入
const handleMouseEnter = () => {
  if (props.disabled || props.trigger !== 'hover') return

  // 清除之前的定时器
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  // 延迟打开菜单
  hoverTimer = setTimeout(() => {
    open()
  }, props.hoverDelay)
}

// 处理鼠标离开
const handleMouseLeave = () => {
  if (props.trigger !== 'hover') return

  // 清除打开定时器
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  // 如果设置了悬停关闭延迟，则延迟关闭
  if (props.hoverCloseDelay > 0) {
    hoverTimer = setTimeout(() => {
      close()
    }, props.hoverCloseDelay)
  }
  // 否则不自动关闭，只通过点击外部关闭
}

// 处理点击外部关闭菜单
function handleClickOutside(event: MouseEvent) {
  if (!props.closeOnClickOutside || !isOpen.value) return

  const target = event.target as Node
  const menuElement = menuRef.value
  const triggerElement = triggerRef.value

  if (
    menuElement &&
    triggerElement &&
    !menuElement.contains(target) &&
    !triggerElement.contains(target)
  ) {
    close()
  }
}

// 处理ESC键关闭
function handleKeyDown(event: KeyboardEvent) {
  if (props.closeOnEscape && event.key === 'Escape' && isOpen.value) {
    close()
  }
}

// 监听菜单打开状态变化
watch(isOpen, async (newValue, oldValue) => {
  if (newValue && !oldValue) {
    await nextTick()
    // 菜单从关闭变为打开时，重新检测位置
    if (props.position === 'auto') {
      detectPosition()
    }
    if (props.teleport) {
      await updateTeleportedPosition()
      addFloatingListeners()
    }
    emit('open')
  } else if (!newValue && oldValue) {
    removeFloatingListeners()
    emit('close')
  }
})

// 生命周期钩子
onMounted(() => {
  if (props.closeOnClickOutside) {
    document.addEventListener('click', handleClickOutside)
  }
  if (props.closeOnEscape) {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('keydown', handleKeyDown)
  removeFloatingListeners()
})

// 暴露方法给父组件
defineExpose({
  open,
  close,
  toggle: toggleMenu,
})
</script>

<template>
  <div class="menu relative" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <!-- 触发器 -->
    <div
      ref="triggerRef"
      :class="['cursor-pointer', triggerClass, { 'opacity-50 cursor-not-allowed': disabled }]"
      @click="handleTriggerClick"
      role="button"
      :aria-expanded="isOpen"
      :aria-haspopup="true"
      :disabled="disabled"
    >
      <slot name="trigger" :isOpen="isOpen" :disabled="disabled">
        <button
          type="button"
          class="menu-button flex items-center px-3 py-2 text-sm font-medium rounded-lg bg-transparent hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-600 dark:text-gray-400"
          :disabled="disabled"
        >
          <span>点击展开菜单</span>
          <svg
            class="ml-2 w-4 h-4 transition-transform duration-200"
            :class="{ 'rotate-180': isOpen }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </slot>
    </div>

    <!-- 菜单内容 -->
    <Teleport to="body" :disabled="!teleport">
      <transition
        enter-active-class="transition ease-out duration-100"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition ease-in duration-75"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <div
          v-show="isOpen"
          ref="menuRef"
          :class="menuClasses"
          :style="menuStyles"
          role="menu"
          :inert="!isOpen ? true : undefined"
        >
          <slot name="menu" :close="close" :isOpen="isOpen">
            <div>
              <div class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">请添加菜单内容</div>
            </div>
          </slot>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
