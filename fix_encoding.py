# Read the file
with open('js/adminview.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Dictionary of corrupted -> correct replacements
replacements = {
    'ÄÄƒng xuáº¥t': 'Đăng xuất',
    'Sá»­a': 'Sửa',
    'XÃ³a': 'Xóa',
    'Dá»± Ã¡n': 'Dự án',
    'Danh má»¥c': 'Danh mục',
    'TrÆ°á»ng tÃ¹y chá»n': 'Trường tùy chọn',
    'TÃªn chá»‰ má»¥c': 'Tên chỉ mục',
    'Ná»™i dung/hÆ°á»›ng dáº«n': 'Nội dung/hướng dẫn',
    'TÃªn bÆ°á»›c': 'Tên bước',
    'HÃ nh Ä'á»™ng / Link': 'Hành động / Link',
    'TiÃªu Ä'á» bÆ°á»›c': 'Tiêu đề bước',
    '+ ThÃªm má»¥c': '+ Thêm mục',
    'KhÃ´ng cÃ³ file nÃ o Ä'Æ°á»£c chá»n': 'Không có file nào được chọn',
    'Vui lÃ²ng chá»n file CSV': 'Vui lòng chọn file CSV',
    'Äang xá»­ lÃ½ file CSV': 'Đang xử lý file CSV',
    'Äang Ä'á»c file': 'Đang đọc file',
    'Äang phÃ¢n tÃ­ch dá»¯ liá»‡u': 'Đang phân tích dữ liệu',
    'KhÃ´ng tÃ¬m tháº¥y dá»¯ liá»‡u há»£p lá»‡ trong file CSV': 'Không tìm thấy dữ liệu hợp lệ trong file CSV',
    'Äang xÃ³a dá»¯ liá»‡u cÅ©': 'Đang xóa dữ liệu cũ',
    'Äang nháº­p dá»¯ liá»‡u má»›i': 'Đang nhập dữ liệu mới',
    'nhÃ  cung cáº¥p': 'nhà cung cấp',
    'HoÃ n thÃ nh': 'Hoàn thành',
    'Nháº­p thÃ nh cÃ´ng': 'Nhập thành công',
    'Lá»—i nháº­p CSV': 'Lỗi nhập CSV',
    'Tráº¡ng thÃ¡i cÆ¡ sá»Ÿ dá»¯ liá»‡u': 'Trạng thái cơ sở dữ liệu',
    'KhÃ´ng thá»ƒ táº£i tráº¡ng thÃ¡i cÆ¡ sá»Ÿ dá»¯ liá»‡u': 'Không thể tải trạng thái cơ sở dữ liệu',
    'Lá»—i khi táº£i danh sÃ¡ch user': 'Lỗi khi tải danh sách user',
    'Vui lÃ²ng nháº­p tÃªn tÃ i khoáº£n vÃ  máº­t kháº©u': 'Vui lòng nhập tên tài khoản và mật khẩu',
    'Vui lÃ²ng nháº­p tÃªn hiá»ƒn thá»‹': 'Vui lòng nhập tên hiển thị',
    'Táº¡o tÃ i khoáº£n thÃ nh cÃ´ng': 'Tạo tài khoản thành công',
    'Lá»—i khi táº¡o tÃ i khoáº£n': 'Lỗi khi tạo tài khoản',
    'TÃªn tÃ i khoáº£n khÃ´ng Ä'Æ°á»£c Ä'á»ƒ trá»'ng': 'Tên tài khoản không được để trống',
    'TÃªn tÃ i khoáº£n Ä'Ã£ tá»"n táº¡i': 'Tên tài khoản đã tồn tại',
    'Cáº­p nháº­t thÃ´ng tin thÃ nh cÃ´ng': 'Cập nhật thông tin thành công',
    'Lá»—i khi cáº­p nháº­t thÃ´ng tin': 'Lỗi khi cập nhật thông tin',
    'Nháº­p máº­t kháº©u má»›i': 'Nhập mật khẩu mới',
    'Äá»•i máº­t kháº©u thÃ nh cÃ´ng': 'Đổi mật khẩu thành công',
    'Lá»—i khi Ä'á»•i máº­t kháº©u': 'Lỗi khi đổi mật khẩu',
    'Báº¡n cÃ³ cháº¯c cháº¯n muá»'n xÃ³a tÃ i khoáº£n nÃ y': 'Bạn có chắc chắn muốn xóa tài khoản này',
    'XÃ³a tÃ i khoáº£n thÃ nh cÃ´ng': 'Xóa tài khoản thành công',
    'Lá»—i khi xÃ³a tÃ i khoáº£n': 'Lỗi khi xóa tài khoản',
    'Lá»—i khi táº£i bá»™ lá»c KPI': 'Lỗi khi tải bộ lọc KPI',
    'ÄÃ£ táº£i': 'Đã tải',
    'báº£n ghi KPI': 'bản ghi KPI',
    'Lá»—i khi táº£i dá»¯ liá»‡u KPI': 'Lỗi khi tải dữ liệu KPI',
    'Cáº­p nháº­t KPI thÃ nh cÃ´ng': 'Cập nhật KPI thành công',
    'Lá»—i khi cáº­p nháº­t KPI': 'Lỗi khi cập nhật KPI',
    'Báº¡n cÃ³ cháº¯c cháº¯n muá»'n xÃ³a báº£n ghi KPI nÃ y': 'Bạn có chắc chắn muốn xóa bản ghi KPI này',
    'XÃ³a KPI thÃ nh cÃ´ng': 'Xóa KPI thành công',
    'Lá»—i khi xÃ³a KPI': 'Lỗi khi xóa KPI',
    'Báº¡n Ä'Æ°á»£c phÃ¢n cÃ´ng xá»­ lÃ½ Manual Schedule hÃ´m nay': 'Bạn được phân công xử lý Manual Schedule hôm nay',
    'TÃ i khoáº£n': 'Tài khoản',
    'ChÆ°a cÃ³ tÃ i khoáº£n': 'Chưa có tài khoản',
    'Nháº­p tÃªn tÃ i khoáº£n': 'Nhập tên tài khoản',
    'Nháº­p tÃªn hiá»ƒn thá»‹': 'Nhập tên hiển thị',
    'Sá»­a': 'Sửa',
    'Há»§y': 'Hủy',
    'Äá»•i MK': 'Đổi MK',
    'KÃ­nh gá»­i': 'Kính gửi',
}

# Apply replacements
for wrong, correct in replacements.items():
    text = text.replace(wrong, correct)

# Write back
with open('js/adminview.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('Fixed all Vietnamese characters!')

