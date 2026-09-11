# Finan

Ứng dụng SaaS quản lý thu chi bằng Next.js 16, Supabase và SePay API v2. Giao diện hỗ trợ desktop, tablet và mobile; người dùng có thể đăng ký, kết nối tài khoản SePay ở chế độ chỉ đọc, xem giao dịch, lọc theo tháng, xuất CSV và mua gói sử dụng.

## Dữ liệu động

Tên thương hiệu, nhãn workspace, trạng thái, toàn bộ mục điều hướng, tiêu đề/mô tả từng trang và các gói dịch vụ được đọc từ Supabase ở mỗi request. Có thể chỉnh nội dung mà không cần sửa mã nguồn qua các bảng:

- `finan_app_settings`
- `finan_navigation_items`
- `finan_plans`

## Chạy local

Yêu cầu Node.js 22 trở lên.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Điền các biến Supabase và bí mật server trong `.env.local`. Không commit file môi trường. Schema đầy đủ nằm tại `supabase/schema.sql`.

Sau khi áp dụng schema lần đầu, tạo câu SQL chứa **chỉ bản băm** của bí mật nội bộ rồi chạy câu SQL đó trong Supabase SQL Editor:

```bash
npm run secret:hash
```

Giá trị gốc trong `.env.local` và giá trị dùng trên Vercel phải giống nhau. Lệnh trên không in bí mật gốc ra màn hình.

## Biến môi trường

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: cấu hình public của Supabase.
- `INTERNAL_RPC_SECRET`: xác thực các RPC nội bộ.
- `SEPAY_TOKEN_ENCRYPTION_KEY`: khóa AES-256-GCM dùng mã hóa token SePay của khách hàng.
- `SEPAY_WEBHOOK_SECRET`: bí mật HMAC của webhook thanh toán nền tảng.
- `BILLING_BANK_ACCOUNT`, `BILLING_ACCOUNT_NAME`: tài khoản nhận tiền bán gói.
- `BILLING_BANK_CODE`: đúng mã `gateway` mà webhook SePay gửi về; `BILLING_BANK_BIN`: mã BIN dùng tạo VietQR.
- `BILLING_SUB_ACCOUNT`: tài khoản phụ nhận webhook, nếu dùng.
- `APP_URL`: URL chính thức của bản triển khai.

Nếu chưa cấu hình tài khoản nhận tiền, màn hình gói vẫn hiển thị nhưng nút thanh toán được khóa an toàn.

Trong SePay, tạo webhook trỏ tới `https://<ten-mien>/api/webhooks/sepay`, bật chữ ký HMAC và dùng cùng giá trị `SEPAY_WEBHOOK_SECRET`. Nội dung chuyển khoản do ứng dụng tạo có dạng `FIN` kèm 20 ký tự; hệ thống nhận mã từ trường `code` hoặc tự tìm trong nội dung giao dịch. Sự kiện kiểm tra của SePay có `id = 0` được xác minh chữ ký và phản hồi thành công nhưng không ghi vào đơn hàng.

Ứng dụng chỉ gọi `GET /bank-accounts` và `GET /transactions`, nhưng API Access Token thô vẫn mang quyền do SePay cấp. Nên tạo token riêng cho Finan, không dùng lại ở nơi khác, luân chuyển định kỳ và thu hồi ngay nếu nghi lộ.

## Kiểm tra

```bash
npm test
npm run lint
npm run build
```

Các route thay đổi dữ liệu kiểm tra đăng nhập, cùng nguồn gửi request và giới hạn tần suất. Token SePay chỉ được giải mã ở server; trình duyệt không nhận token. Webhook xác minh chữ ký HMAC trên raw body, kiểm tra thời gian chống replay và cập nhật đơn hàng/subscription bằng RPC nguyên tử. Tất cả bảng tenant đều bật RLS.
