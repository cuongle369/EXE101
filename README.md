# Hướng dẫn chạy Hệ thống AI Task Manager (MVP) bằng Docker

Tài liệu này hướng dẫn bạn cách khởi động toàn bộ hệ thống (Frontend và Backend) chỉ bằng một vài lệnh đơn giản thông qua công cụ Docker.

## Yêu cầu hệ thống

Trước khi bắt đầu, đảm bảo máy tính của bạn đã cài đặt:

1. **Docker Desktop** (hoặc Docker Engine).
   - Tải xuống và cài đặt tại: [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
   - Lưu ý: Trên Windows, sau khi cài đặt cần khởi động Docker Desktop trước.

2. **Git** (tuỳ chọn, chỉ dùng nếu bạn clone toàn bộ mã nguồn về thay vì tải qua file nén).

## Cách chạy dự án

1. **Mở thư mục dự án**: 
   Mở ứng dụng Terminal hoặc Command Prompt, và điều hướng đến thư mục `MVP` (nơi chứa file `docker-compose.yml`).

2. **Cấu hình Gemini API Key**:
   *(Tuỳ chọn nhưng khuyến nghị để AI phân tích chuẩn xác)*
   - Mở file `backend/.env`.
   - Cập nhật giá trị `GEMINI_API_KEY` bằng API key của bạn, ví dụ:
     ```env
     GEMINI_API_KEY="AIzaSy...abc123"
     ```

3. **Khởi động hệ thống bằng Docker Compose**:
   Trong Terminal, gõ lệnh sau và nhấn Enter:
   ```bash
   docker-compose up --build -d
   ```
   *Quá trình này có thể mất vài phút ở lần đầu tiên để tải các môi trường cần thiết.*

## Cách truy cập ứng dụng

Sau trạng thái "Done", hệ thống của bạn đã sẵn sàng tại các địa chỉ sau:

- **Giao diện người dùng (Frontend):** 
  Truy cập qua trình duyệt tại địa chỉ: [http://localhost:8080](http://localhost:8080)
- **API Backend:**
  Giao diện phát triển (Swagger UI): [http://localhost:8000/docs](http://localhost:8000/docs)

*(Sử dụng cùng chung một cơ sở dữ liệu và có thể tương tác với nhau ngay lập tức).*

## Các lệnh hỗ trợ khác

- Lệnh **dừng hệ thống**:
  ```bash
  docker-compose down
  ```

- Lệnh **xem log lỗi của hệ thống**:
  ```bash
  docker-compose logs -f
  ```

---
*Lưu ý: Bạn không cần cài đặt Python hoặc Nginx. Toàn bộ môi trường đã được đóng gói sẵn trong Docker container.*
