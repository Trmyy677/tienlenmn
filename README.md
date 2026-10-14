# Tiến Lên Online

Game Tiến Lên Miền Nam nhiều người chơi, realtime. Phòng riêng bằng mã 5 ký tự, đăng nhập chỉ bằng nickname.
Stack: Node.js + Express + Socket.IO (server-authoritative), Supabase (lưu lịch sử và bảng xếp hạng), deploy trên Render.

## Luật đã cài (server kiểm tra toàn bộ)
- 52 lá, chia 13 lá mỗi người, 2–4 người. Thứ tự: 3 < 4 < … < K < A < 2; chất: ♠ < ♣ < ♦ < ♥.
- Tổ hợp: lẻ, đôi, sám, tứ quý, sảnh (≥3 lá), đôi thông (≥3 đôi). Sảnh và đôi thông không chứa heo (2).
- Phải đánh cùng loại, cùng số lá, lá cao nhất lớn hơn.
- Chặt: 3 đôi thông hoặc tứ quý chặt heo lẻ; tứ quý hoặc 4 đôi thông chặt đôi heo; 4 đôi thông chặt tứ quý.
- Ván đầu người giữ 3♠ đi trước và phải đánh kèm 3♠; các ván sau người thắng đi trước.
- Bỏ lượt là khoá đến hết vòng. Mọi người bỏ thì người đánh cuối thắng vòng và dẫn tiếp.
- Ai hết bài trước thắng. Điểm: người thắng nhận tổng số lá còn lại của những người kia, mỗi người thua mất đúng số lá còn trên tay.
- Hết 30 giây tự động bỏ lượt (hoặc đánh lá nhỏ nhất nếu đang dẫn vòng). Người mất kết nối bị xử tự động sau 4 giây, vào lại bằng cùng trình duyệt sẽ khôi phục chỗ.

Chưa có: tới trắng, thúi heo/chặt chồng, chat, bot. Thêm trong `server/game.js` và `server/rooms.js`.

## Chạy local
```bash
npm install
cp .env.example .env   # tuỳ chọn, điền Supabase
npm start              # http://localhost:3000
```
(Node 18+ đọc `.env` bằng `node --env-file=.env server/index.js`, hoặc export biến môi trường.)

## 1. Supabase
1. Tạo project tại supabase.com.
2. Vào **SQL Editor**, dán toàn bộ `supabase/schema.sql`, bấm Run.
3. Vào **Project Settings → API**, lấy `Project URL` và `service_role` key.
   Key này chỉ để ở biến môi trường của Render, tuyệt đối không đưa vào code hay client. Bảng đã bật RLS và không có policy nên người ngoài không đọc/ghi trực tiếp được.

## 2. GitHub
```bash
git init && git add . && git commit -m "Tiến Lên Online"
git branch -M main
git remote add origin https://github.com/<user>/tienlen-online.git
git push -u origin main
```

## 3. Render
1. Render → **New → Blueprint**, chọn repo (đọc `render.yaml`). Hoặc **New → Web Service** với Build `npm install`, Start `npm start`.
2. Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy xong mở URL `https://<tên>.onrender.com`.

Lưu ý:
- Trạng thái phòng nằm trong RAM, nên chỉ chạy **1 instance**. Muốn scale ngang cần thêm Redis adapter và lưu state ngoài.
- Gói Free ngủ sau ~15 phút không có truy cập; phòng đang chơi sẽ mất khi restart. Dùng gói trả phí hoặc ping `/health` định kỳ nếu cần.
- Thiếu biến Supabase thì game vẫn chạy bình thường, chỉ không lưu lịch sử.

## Cấu trúc
```
server/index.js   Express + Socket.IO, sự kiện: create, join, start, play, pass, leave
server/rooms.js   phòng, lượt, vòng, hẹn giờ, tính điểm
server/game.js    bộ bài, nhận diện tổ hợp, so sánh/chặt
public/           giao diện dark esports (HTML/CSS/JS thuần)
supabase/schema.sql   bảng matches, match_players, view leaderboard
render.yaml       blueprint deploy
```
