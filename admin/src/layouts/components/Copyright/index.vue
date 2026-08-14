<script setup lang="ts">
  import useSettingsStore from '@/store/modules/settings';

  defineOptions({
    name: 'Copyright',
  });

  const settingsStore = useSettingsStore();
</script>

<template>
  <footer v-if="settingsStore.settings.copyright.enable" class="copyright">
    <span>Copyright</span>
    <SvgIcon name="i-ri:copyright-line" :size="18" />
    <span v-if="settingsStore.settings.copyright.dates">{{
      settingsStore.settings.copyright.dates
    }}</span>
    <template v-if="settingsStore.settings.copyright.company">
      <span>{{ settingsStore.settings.copyright.company }}</span>
    </template>
    <span v-if="settingsStore.settings.copyright.beian">{{
      settingsStore.settings.copyright.beian
    }}</span>
  </footer>
</template>

<style lang="scss" scoped>
  .copyright {
    --at-apply: flex items-center justify-center flex-wrap my-4 px-4 text-sm text-stone-5;

    span {
      --at-apply: px-1;
    }
  }
</style>
