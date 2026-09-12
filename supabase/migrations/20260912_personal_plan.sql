update public.finan_plans
set name = 'Cá nhân',
    description = 'Theo dõi thu chi và dòng tiền cá nhân với SePay.',
    features = array[
      '1 tài khoản ngân hàng',
      'Đồng bộ giao dịch SePay',
      'Theo dõi thu chi cá nhân',
      'Xuất dữ liệu CSV'
    ],
    recommended = false,
    active = true,
    updated_at = now()
where id = 'starter';
