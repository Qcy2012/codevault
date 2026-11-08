// 自动判断环境：如果是在本地电脑上运行，用本地地址；否则用线上域名
const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

const API_BASE = isLocal 
  ? "http://127.0.0.1:3000" 
  : "https://codevault.qcyblog.dpdns.org";
