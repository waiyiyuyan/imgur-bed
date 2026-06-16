const fileInput = document.getElementById("file-input");
const imgGrid = document.getElementById("imgGrid");

// 弹窗/浮层 DOM
const uploadBtn = document.getElementById("uploadOpenBtn");
const uploadPopover = document.getElementById("uploadPopover");
const popoverClose = document.querySelector(".popover-close");
const popInit = document.getElementById("popInit");
const popProgress = document.getElementById("popProgress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const popPreview = document.getElementById("popPreview");

// 新增链接面板DOM
const popLinkArea = document.getElementById("popLinkArea");
const linkBox = document.getElementById("linkBox");
const copyLinkBtn = document.getElementById("copyLinkBtn");

// ===================== 配置项（固定你的 Worker 域名）=====================
const UPLOAD_WORKER = "https://imgurup.lovefree.de5.net";
const PROXY_WORKER = "https://imgvideop.lovefree.de5.net";
// =====================================================================

// 云端分页全局变量（替换本地存储）
let allImageList = [];
let lastCursor = "";
let hasMore = true;
let isLoading = false;

/**
 * 拼接代理地址
 * @param {string} rawUrl Imgur 原始直链
 * @returns {string} 代理访问地址
 */
function getProxyUrl(rawUrl) {
  return `${PROXY_WORKER}?url=${encodeURIComponent(rawUrl)}`;
}

/**
 * 拼接缩略图代理地址（用于列表展示）
 * @param {string} rawUrl Imgur 原始直链
 * @returns {string}
 */
function getThumbUrl(rawUrl) {
  // 分割文件名和后缀，插入 m 生成中等缩略图
  const lastDotIndex = rawUrl.lastIndexOf(".");
  if (lastDotIndex === -1) return getProxyUrl(rawUrl);

  const name = rawUrl.slice(0, lastDotIndex);
  const ext = rawUrl.slice(lastDotIndex);
  const thumbUrl = `${name}m${ext}`;

  return `${PROXY_WORKER}?url=${encodeURIComponent(thumbUrl)}`;
}

/**
 * 判断是否为视频链接
 * @param {string} url 原始链接
 * @returns {boolean}
 */
function isVideoUrl(url) {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm");
}

/**
 * 渲染媒体列表
 * @param {Array} list 媒体数据数组
 */
function renderImages(list) {
  allImageList = list;
  const grid = imgGrid;
  grid.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    grid.className = "waterfall";
    grid.innerHTML = "<p class='load-tip'>暂无图片</p>";
    return;
  }

  grid.className = "waterfall has-img";
  // 分批渲染，每批 10 个
  const batch = 10;
  let index = 0;

  function renderBatch() {
    let html = "";
    const end = Math.min(index + batch, list.length);
    for (; index < end; index++) {
      const item = list[index];
      // 1. 列表展示小缩略图，给<img src>用
		const thumbSrc = getThumbUrl(item.rawUrl);
		// 2. 原图地址，给弹窗预览、下载按钮用，存进 data-proxy
		const fullSrc = getProxyUrl(item.rawUrl);
		// 3. Markdown外链图片也用原图
		const mdLink = getProxyUrl(item.rawUrl);
        html += `
		  <div class="img-item" data-raw="${item.rawUrl}" data-proxy="${fullSrc}" data-md="![${item.name}](${mdLink})">
	        <div class="img-wrap">
	          <img src="${thumbSrc}" alt="媒体文件" loading="lazy">
	          <button class="more-btn">...</button>
	        </div>
	        <div class="action-menu">
	          <button class="menu-item download-btn">下载文件</button>
	          <button class="menu-item copy-md-btn">复制 Markdown</button>
	        </div>
	      </div>
      `;
    }
    grid.innerHTML += html;
    // 还有剩余就继续下一批
    if (index < list.length) {
      setTimeout(renderBatch, 100);
    }
  }

  renderBatch();
}

/**
 * 分页加载云端图片列表
 * @param {boolean} isLoadMore true=滚动加载更多，false=初始化刷新首页
 */
async function loadMediaList(isLoadMore = false) {
  if (isLoading || (!hasMore && isLoadMore)) return;
  isLoading = true;

  try {
    let reqUrl = `${UPLOAD_WORKER}/listMedia`;
    if (lastCursor) {
      reqUrl += `?cursor=${lastCursor}`;
    }
    const res = await fetch(reqUrl);
    const data = await res.json();

    if (!isLoadMore) {
      // 首次加载，覆盖原有列表
      allImageList = data.list;
    } else {
      // 滚动加载，追加数据
      allImageList.push(...data.list);
    }

    // 更新分页标记
    lastCursor = data.lastCursor;
    hasMore = data.hasMore;
    renderImages(allImageList);
  } catch (err) {
    console.error("加载图库失败：", err);
  } finally {
    isLoading = false;
  }
}

/**
 * 滚动触底加载更多监听
 */
function handleScrollLoadMore() {
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  const clientHeight = document.documentElement.clientHeight;
  const scrollHeight = document.documentElement.scrollHeight;
  // 距离底部200px触发加载
  if (scrollTop + clientHeight + 200 >= scrollHeight) {
    loadMediaList(true);
  }
}

/**
 * 上传文件核心逻辑（支持进度条）
 * @param {File} file 图片文件对象
 */
function uploadFile(file) {
  const fileName = file.name;
  const xhr = new XMLHttpRequest();
  const reqUrl = `${UPLOAD_WORKER}?filename=${encodeURIComponent(fileName)}`;

  // 切换状态：图标区隐藏，进度条显示
  popInit.style.display = "none";
  popProgress.style.display = "block";
  popPreview.style.display = "none";
  progressFill.style.width = "0%";
  progressText.innerText = "0%";

  xhr.open("POST", reqUrl);

  // 监听上传进度
  xhr.upload.addEventListener("progress", e => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = percent + "%";
      progressText.innerText = percent + "%";
    }
  });

    // 上传完成回调
  xhr.addEventListener("load", () => {
    popProgress.style.display = "none";
    try {
      const data = JSON.parse(xhr.responseText);
      if (!data.success) {
        alert("上传失败：" + (data.msg || "未知错误"));
        popInit.style.display = "flex";
        return;
      }

      const rawLink = data.link;
      const proxyLink = getProxyUrl(rawLink);
      // 上传成功：不显示预览图，只展示纯直链
      popInit.style.display = "none";
      popPreview.style.display = "none";
      popLinkArea.style.display = "flex";
      linkBox.innerText = proxyLink;
      // 复制按钮点击事件
      copyLinkBtn.onclick = function () {
        navigator.clipboard.writeText(proxyLink);
        this.innerText = "已复制！";
        setTimeout(() => {
          this.innerText = "复制链接";
        }, 1200);
      };

      // 直接插入到列表最顶部渲染（云端后端已自动存入D1，无需本地存储）
      allImageList.unshift({
        name: fileName,
        rawUrl: rawLink
      });
      renderImages(allImageList);
    } catch (err) {
      alert("解析返回数据失败");
      popInit.style.display = "flex";
    }
  });

  // 网络异常
  xhr.addEventListener("error", () => {
    alert("网络请求失败");
    popProgress.style.display = "none";
    popInit.style.display = "flex";
  });

  xhr.send(file);
}

// 页面初始化：加载第一页数据 + 绑定滚动监听
window.addEventListener("load", () => {
  loadMediaList(false);
  window.addEventListener("scroll", handleScrollLoadMore);
});

// 关闭上传浮层按钮
popoverClose.addEventListener("click", () => {
  uploadPopover.style.display = "none";
  // 重置浮层状态
  popInit.style.display = "flex";
  popProgress.style.display = "none";
  popPreview.style.display = "none";
  popLinkArea.style.display = "none"; // 新增重置链接面板
  progressFill.style.width = "0%";
  progressText.innerText = "0%";
  fileInput.value = "";
});

// 点击上传按钮 → 打开浮层
uploadBtn.addEventListener("click", () => {
  uploadPopover.style.display = "flex";
  // 打开时重置为初始状态
  popInit.style.display = "flex";
  popProgress.style.display = "none";
  popPreview.style.display = "none";
  popLinkArea.style.display = "none"; // 新增
  progressFill.style.width = "0%";
  progressText.innerText = "0%";
});

// 点击浮层初始区域唤起文件选择
popInit.addEventListener("click", () => {
  fileInput.click();
});

// 选中文件，支持图片/视频
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
});

// 浮层拖拽上传，支持图片/视频
uploadPopover.addEventListener("dragover", e => {
  e.preventDefault();
  uploadPopover.style.borderColor = "#e60023";
});
uploadPopover.addEventListener("dragleave", () => {
  uploadPopover.style.borderColor = "#ccc";
});
uploadPopover.addEventListener("drop", e => {
  e.preventDefault();
  uploadPopover.style.borderColor = "#ccc";
  const file = e.dataTransfer.files[0];
  if (file) {
    uploadFile(file);
  }
});

/**
 * 关闭所有下拉菜单
 */
function closeAllMenu() {
  document.querySelectorAll(".action-menu").forEach(menu => {
    menu.classList.remove("show");
  });
}

// 全局点击关闭菜单
document.addEventListener("click", e => {
  if (!e.target.classList.contains("more-btn")) {
    closeAllMenu();
  }
});

// 点击空白处关闭上传浮层
document.addEventListener("click", e => {
  const target = e.target;
  if (!uploadBtn.contains(target) && !uploadPopover.contains(target)) {
    uploadPopover.style.display = "none";
    popInit.style.display = "flex";
    popProgress.style.display = "none";
    popPreview.style.display = "none";
    popLinkArea.style.display = "none"; // 新增重置链接面板
    progressFill.style.width = "0%";
    progressText.innerText = "0%";
    fileInput.value = "";
  }
});

// 卡片交互：菜单、预览、下载、复制
imgGrid.addEventListener("click", e => {
  const target = e.target;
  const card = target.closest(".img-item");
  if (!card) return;

  const moreBtn = target.closest(".more-btn");
  const imgWrap = target.closest(".img-wrap");
  const menuItem = target.closest(".menu-item");
  const currentMenu = card.querySelector(".action-menu");

  const rawUrl = card.dataset.raw;
  const proxyUrl = card.dataset.proxy;

  // 切换下拉菜单
  if (moreBtn) {
    e.stopPropagation();
    const isOpen = currentMenu.classList.contains("show");
    if (isOpen) {
      currentMenu.classList.remove("show");
    } else {
      closeAllMenu();
      currentMenu.classList.add("show");
    }
    return;
  }

  // 点击图片新开标签页打开原图
  if (imgWrap) {
    window.open(proxyUrl, "_blank");
    return;
  }

  // 菜单项功能
  if (menuItem) {
    // 下载
    if (target.classList.contains("download-btn")) {
      const fileName = rawUrl.split("/").pop();
      fetch(proxyUrl)
        .then(res => res.blob())
        .then(blob => {
          const a = document.createElement("a");
          const blobUrl = URL.createObjectURL(blob);
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        })
        .catch(err => {
          alert("下载失败，请重试");
        });
    }
    // 复制 Markdown
    else if (target.classList.contains("copy-md-btn")) {
      const mdText = card.dataset.md;
      target.textContent = "已复制";
      navigator.clipboard.writeText(mdText);
      setTimeout(() => {
        target.textContent = "复制 Markdown";
        closeAllMenu();
      }, 1200);
      e.stopPropagation();
    }
  }
});
