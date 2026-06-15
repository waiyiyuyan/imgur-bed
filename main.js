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

const previewModal = document.getElementById("previewModal");
const closeBtns = document.querySelectorAll(".close-btn");
const modalImg = document.getElementById("modalImg");
const modalVideo = document.getElementById("modalVideo");

// ===================== 配置项（固定你的 Worker 域名）=====================
const UPLOAD_WORKER = "https://imgurup.lovefree.de5.net";
const PROXY_WORKER = "https://imgvideop.lovefree.de5.net";
// =====================================================================

// 全局缓存媒体数据 + 本地持久化 key
const STORAGE_KEY = "media_list";
let allImageList = [];

// 从本地存储读取历史列表
function loadLocalList() {
  const local = localStorage.getItem(STORAGE_KEY);
  if (local) {
    try {
      allImageList = JSON.parse(local);
    } catch (e) {
      allImageList = [];
    }
  }
  renderImages(allImageList);
}

// 保存列表到本地存储
function saveLocalList(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

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
    grid.innerHTML = "<p class='load-tip'>暂无文件</p>";
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
      // const proxySrc = getProxyUrl(item.rawUrl);
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
        </div>
        <div class="btn-wrap">
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
 * 加载图库（读取本地存储）
 */
async function loadGallery() {
  loadLocalList();
}

setTimeout(loadGallery, 200);

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
      // 上传成功展示预览图
      popPreview.innerHTML = `<img src="${proxyLink}" alt="预览图">`;
      popPreview.style.display = "block";

      // 存入本地列表
      allImageList.unshift({
        name: fileName,
        rawUrl: rawLink
      });
	  // 限制最大保存 80 条，超出删除末尾旧数据
		const MAX_COUNT = 80;
		if (allImageList.length > MAX_COUNT) {
		  allImageList = allImageList.slice(0, MAX_COUNT);
		}
      saveLocalList(allImageList);
      loadGallery();
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

// 关闭上传浮层按钮
popoverClose.addEventListener("click", () => {
  uploadPopover.style.display = "none";
  // 重置浮层状态
  popInit.style.display = "flex";
  popProgress.style.display = "none";
  popPreview.style.display = "none";
  progressFill.style.width = "0%";
  progressText.innerText = "0%";
  fileInput.value = "";
});

// 大图预览关闭按钮
closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    previewModal.style.display = "none";
    modalVideo.pause();
    modalVideo.style.display = "none";
    modalImg.style.display = "block";
  });
});

// 点击上传按钮 → 打开浮层
uploadBtn.addEventListener("click", () => {
  uploadPopover.style.display = "flex";
  // 打开时重置为初始状态
  popInit.style.display = "flex";
  popProgress.style.display = "none";
  popPreview.style.display = "none";
  progressFill.style.width = "0%";
  progressText.innerText = "0%";
});

// 点击浮层初始区域唤起文件选择
popInit.addEventListener("click", () => {
  fileInput.click();
});

// 选中文件，仅放行图片
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file && file.type.startsWith("image/")) {
    uploadFile(file);
  }
});

// 浮层拖拽上传，仅放行图片
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
  if (file && file.type.startsWith("image/")) {
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
    progressFill.style.width = "0%";
    progressText.innerText = "0%";
    fileInput.value = "";
  }
});

// 卡片交互：菜单、预览、下载、复制、删除
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

  // 点击图片区域 → 大图预览
  if (imgWrap) {
    previewModal.style.display = "flex";
    if (isVideoUrl(rawUrl)) {
      modalImg.style.display = "none";
      modalVideo.style.display = "block";
      modalVideo.src = proxyUrl;
    } else {
      modalVideo.style.display = "none";
      modalImg.style.display = "block";
      modalImg.src = proxyUrl;
    }
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
    // 删除文件
	/*
    else if (target.classList.contains("del-btn")) {
      if (confirm("确定删除该文件？")) {
        const delRaw = card.dataset.raw;
        allImageList = allImageList.filter(item => item.rawUrl !== delRaw);
        saveLocalList(allImageList);
        renderImages(allImageList);
      }
      closeAllMenu();
    }
	*/
  }
});