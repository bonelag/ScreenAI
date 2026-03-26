<p align="center">
  <img src="logo.png" alt="ScreenAI Logo" width="120" />
</p>

<h1 align="center">ScreenAI</h1>

<p align="center">
  <strong>Trợ lý AI phân tích màn hình thông minh trên Desktop</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0-FFC131?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/React-18.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Rust-1.80%2B-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

## ✨ Giới thiệu

**ScreenAI** là một ứng dụng Desktop mạnh mẽ, mã nguồn mở, cho phép bạn sử dụng AI để phân tích trực tiếp bất kỳ nội dung nào trên màn hình máy tính của bạn thông qua thao tác chụp ảnh màn hình và trò chuyện. 

Chỉ với một phím tắt duy nhất, bạn có thể khoanh vùng màn hình, gõ câu hỏi và nhận ngay câu trả lời từ các mô hình AI tiên tiến (GPT-4o, Claude 3.5, Gemini 1.5 Pro, v.v.).

## 🚀 Tính năng nổi bật

- 🎯 **Chụp màn hình thông minh:** Cắt nhanh bất kỳ khu vực nào trên màn hình với công cụ chọn vùng cực nhạy.
- 💬 **Floating Chatbox:** Giao diện chat nổi (floating) thanh thoát, tự động tương thích với kích thước nội dung.
- 📎 **Ctrl+V Paste Ảnh:** Dễ dàng dán ảnh đã copy vào khung chat.
- ⚙️ **Hỗ trợ System Prompt / Thinking AI:** Cung cấp thông điệp điều hướng (system prompt) và kiểm soát hoàn toàn việc AI được "suy nghĩ" ngầm (ví dụ: DeepSeek R1).
- ⌨️ **Phím tắt toàn cầu (Global Hotkeys):** 
  - `Ctrl + Shift + O`: Chụp ngay vùng màn hình.
  - `Ctrl + Shift + I`: Gọi nhanh khung chat-only (hoàn hảo để hỏi đáp nhanh).
- 🔌 **Tùy chỉnh linh hoạt:** Thay đổi API Endpoint (hỗ trợ chuẩn OpenAI), API Key và Model ngay bên trong ứng dụng, an toàn qua `tauri-plugin-store`. 
- 🗃️ **System Tray (Khay hệ thống):** Chạy ngầm mượt mà, thu nhỏ vào khay hệ thống, tiết kiệm tối đa tài nguyên với backend bằng Rust cực kỳ nhẹ.

## 🛠 Thao tác & Phím tắt
| Thao tác | Phím tắt mặc định | Chức năng     |
| :--- | :--- | :--- |
| **Chụp màn hình** | `Ctrl + Shift + O` | Mở chế độ overlay tối màn hình để khoanh vùng khu vực cần hỏi AI. |
| **Hỏi đáp tĩnh** | `Ctrl + Shift + I` | Mở Chatbox thu nhỏ tĩnh tại, hỗ trợ text & upload ảnh hoặc paste. |
| **Dán ảnh clipbroard** | `Ctrl + V` | Dán ảnh từ bộ nhớ tạm thẳng vào hộp thoại Chatbox (Chế độ chat text). |
| **Thoát overlay/chat** | `Esc` | Hủy chụp/đóng box chat trả tài nguyên về cho desktop. |

## 📦 Cài đặt & Phát triển

### Yêu cầu hệ thống
Nền tảng ScreenAI được xây dựng với kiến trúc Rust backend và Frontend web qua Webview2 (Windows) hoặc WebKit (macOS).

- [Node.js](https://nodejs.org/) (Khuyến nghị v18+)
- [Rust](https://www.rust-lang.org/tools/install) (Khuyến nghị bản mới nhất bằng rustup)
- [C++ Build Tools / Visual Studio SDK](https://tauri.app/v1/guides/getting-started/prerequisites) (Bắt buộc với Windows).

### Build dự án

```bash
# Clone dự án
git clone https://github.com/your-username/ScreenAI.git
cd ScreenAI

# Cài đặt thư viện NPM
npm install

# Khởi chạy chế độ phát triển (Tauri Dev-Mode)
npm run tauri dev

# Build bản Release đóng gói thành Ứng dụng (.exe / .app / .dmg)
npm run tauri build
```

---

## ✅ Lộ Trình Cập Nhật

- [ ] Phát triển tính năng LIVE AI realtime
- [ ] Hỗ trợ thêm nhiều tùy chỉnh AI
- [ ] Nâng cấp giao diện
- [ ] Tích hợp thêm nhiều tính năng

---

## 🔧 Phụ thuộc chính
Dự án được kết tinh từ các công cụ mạnh mẽ:
* **[Tauri v2](https://v2.tauri.app/)**: Nhân xử lý nhẹ, tốc độ cao.
* **[React 18 & Vite](https://vitejs.dev/)**: Frontend linh hoạt, load siêu tốc.
* **[Lucide Icons](https://lucide.dev/)**: Thư viện Icon hiện đại.
* **[TailwindCSS / Vanilla CSS](https://tailwindcss.com/)**: Tạo style UI/UX bóng bẩy.
* **[xcap](https://crates.io/crates/xcap)**: Thư viện Rust chụp màn hình đa nền tảng tối ưu.

## 🤝 Giấy phép
**ScreenAI** là dự án mã nguồn mở và được cấp phép theo [MIT License](LICENSE).
