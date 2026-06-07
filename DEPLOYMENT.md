# 部署指南

需要的材料：
- 服务器，或者自己的电脑
- 经实名认证的腾讯云账号

## 环境配置

首先需要安装 Node.js v24，在 [npmmirror](https://registry.npmmirror.com/binary.html?path=node/latest-krypton/) 上找到符合您系统架构的安装包进行安装。

Node.js 安装完成后，重启系统，设置 npm registry 镜像：

```powershell
npm config set registry https://registry.npmmirror.com
```

安装 pnpm：

```powershell
npm install -g pnpm
```

## 安装

```powershell
pnpm install -g paper-flow-cli
New-Item -ItemType Directory -Path "$env:USERPROFILE/.paper-flow"
New-Item -Path "$env:USERPROFILE/.paper-flow/.env"
```

`%USERPROFILE%/.paper-flow` 将是 PaperFlow 运行的目录。下文所说环境变量配置，写入 `%USERPROFILE%/.paper-flow/.env`。

## 配置腾讯云资源

登录腾讯云账号，进入[访问管理创建子用户](https://console.cloud.tencent.com/cam/user/create?systemType=SubAccount)：

- 用户名：`paper-flow`
- 访问方式：编程访问
- 关联策略：`QcloudOCRReadSelfUinUsage`
- 其余参数不填

一直下一步到“成功新建用户”时，复制 SecretId, SecretKey，写入环境变量：

```ini
PF_QCLOUD_SECRET_ID="AKID********************************"
PF_QCLOUD_SECRET_KEY="********************************"
```

进入 [TokenHub API Key 管理](https://console.cloud.tencent.com/tokenhub/apikey)，创建 API Key：

- Key 名称：`paper-flow`
- 可访问范围：全选
- 其余参数不填

将 Key 写入环境变量：

```ini
PF_QCLOUD_TOKENHUB_API_KEY="sk-************************************************"
```

## 运行服务

```powershell
cd $env:USERPROFILE/.paper-flow
paper-flow-cli
```

PaperFlow 会在终端启动，访问输出中的 URL 即可开始使用。

停止 PaperFlow 运行只需关闭终端。
