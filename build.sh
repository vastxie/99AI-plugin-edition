#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
output_dir="${script_dir}/99AIPluginQuickDeploy"
stage_dir="$(mktemp -d "${script_dir}/.99ai-quick-deploy.XXXXXX")"

cleanup() {
  rm -rf -- "${stage_dir}"
}
trap cleanup EXIT

for command_name in node pnpm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "缺少必要命令：${command_name}" >&2
    exit 127
  fi
done

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( node_major < 20 || node_major >= 25 )); then
  echo "需要 Node.js 20–24，当前版本：$(node --version)" >&2
  exit 64
fi

build_project() {
  local project="$1"
  shift

  echo "==> 安装 ${project} 依赖"
  (
    cd -- "${script_dir}/${project}"
    pnpm install --frozen-lockfile --config.confirmModulesPurge=false
    echo "==> 构建 ${project}"
    "$@"
  )
}

build_project service pnpm build
build_project chat pnpm type-check
(
  cd -- "${script_dir}/chat"
  pnpm build
)
build_project admin pnpm build

mkdir -p -- \
  "${stage_dir}/dist" \
  "${stage_dir}/docs" \
  "${stage_dir}/public/admin" \
  "${stage_dir}/public/chat" \
  "${stage_dir}/public/file"

cp -a "${script_dir}/service/dist/." "${stage_dir}/dist/"
cp -a "${script_dir}/admin/dist/." "${stage_dir}/public/admin/"
cp -a "${script_dir}/chat/dist/." "${stage_dir}/public/chat/"
cp -- "${script_dir}/service/package.json" "${stage_dir}/package.json"
cp -- "${script_dir}/service/pnpm-lock.yaml" "${stage_dir}/pnpm-lock.yaml"
cp -- "${script_dir}/service/pnpm-workspace.yaml" "${stage_dir}/pnpm-workspace.yaml"
cp -- "${script_dir}/service/.env.example" "${stage_dir}/.env.example"
cp -- "${script_dir}/service/start.sh" "${stage_dir}/start.sh"
cp -- "${script_dir}/docs/QUICK_DEPLOY.md" "${stage_dir}/README.md"
cp -- "${script_dir}/LICENSE" "${stage_dir}/LICENSE"
cp -- "${script_dir}/docs/DEPLOYMENT_AND_CONFIGURATION.md" \
  "${stage_dir}/docs/DEPLOYMENT_AND_CONFIGURATION.md"
chmod +x "${stage_dir}/start.sh"

if [[ -e "${output_dir}" && ! -d "${output_dir}" ]]; then
  echo "输出路径已存在且不是目录：${output_dir}" >&2
  exit 73
fi

rm -rf -- "${output_dir}"
mv -- "${stage_dir}" "${output_dir}"
trap - EXIT

echo
echo "三端整合构建完成"
echo "整合目录：${output_dir}"
echo "部署时复制 .env.example 为 .env，安装生产依赖并运行 pnpm start。"
