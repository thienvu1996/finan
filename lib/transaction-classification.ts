export type TransactionCategory =
  | "income_sales"
  | "income_service"
  | "income_salary"
  | "income_other"
  | "expense_cogs"
  | "expense_salary"
  | "expense_marketing"
  | "expense_rent"
  | "expense_utilities"
  | "expense_shipping"
  | "expense_fee"
  | "expense_tax"
  | "expense_food"
  | "expense_transport"
  | "expense_shopping"
  | "expense_other"
  | "transfer_internal"
  | "capital"
  | "loan"
  | "refund"
  | "uncategorized";

export type TransactionClassification = {
  category: TransactionCategory;
  excluded_from_flow: boolean;
};

export function classifyTransaction(input: {
  transfer_type: "in" | "out";
  content?: string | null;
  reference_code?: string | null;
  gateway?: string | null;
}): TransactionClassification {
  const text = `${input.content || ""} ${input.reference_code || ""} ${input.gateway || ""}`.toLocaleLowerCase("vi");

  if (/(chuyển tiền.*(nội bộ|giữa.*tài khoản)|chuyen tien.*(noi bo|giua.*tai khoan)|internal transfer|own account)/i.test(text)) {
    return { category: "transfer_internal", excluded_from_flow: true };
  }
  if (/(góp vốn|gop von|rút vốn|rut von|capital contribution|capital withdrawal)/i.test(text)) {
    return { category: "capital", excluded_from_flow: true };
  }
  if (/(khoản vay|khoan vay|vay vốn|vay von|trả nợ|tra no|repay loan|loan)/i.test(text)) {
    return { category: "loan", excluded_from_flow: true };
  }
  if (/(hoàn tiền|hoan tien|refund|reversal)/i.test(text)) {
    return { category: "refund", excluded_from_flow: true };
  }

  if (input.transfer_type === "in") {
    if (/(lương|luong|salary|payroll)/i.test(text)) return { category: "income_salary", excluded_from_flow: false };
    if (/(đơn hàng|don hang|bán hàng|ban hang|sale|order)/i.test(text)) return { category: "income_sales", excluded_from_flow: false };
    if (/(dịch vụ|dich vu|tư vấn|tu van|project|service|consult)/i.test(text)) return { category: "income_service", excluded_from_flow: false };
    return { category: "income_other", excluded_from_flow: false };
  }

  if (/(nhà cung cấp|nha cung cap|nhập hàng|nhap hang|giá vốn|gia von|supplier|inventory)/i.test(text)) return { category: "expense_cogs", excluded_from_flow: false };
  if (/(lương|luong|salary|payroll)/i.test(text)) return { category: "expense_salary", excluded_from_flow: false };
  if (/(quảng cáo|quang cao|facebook ads|google ads|tiktok ads|marketing)/i.test(text)) return { category: "expense_marketing", excluded_from_flow: false };
  if (/(thuê nhà|thue nha|thuê văn phòng|thue van phong|rent)/i.test(text)) return { category: "expense_rent", excluded_from_flow: false };
  if (/(điện|dien|nước|nuoc|internet|điện thoại|dien thoai|utility|utilities)/i.test(text)) return { category: "expense_utilities", excluded_from_flow: false };
  if (/(vận chuyển|van chuyen|giao hàng|giao hang|shipping|shipper|delivery)/i.test(text)) return { category: "expense_shipping", excluded_from_flow: false };
  if (/(phí ngân hàng|phi ngan hang|phí giao dịch|phi giao dich|bank fee|transaction fee)/i.test(text)) return { category: "expense_fee", excluded_from_flow: false };
  if (/(thuế|thue|tax|lệ phí|le phi)/i.test(text)) return { category: "expense_tax", excluded_from_flow: false };
  if (/(grabfood|shopeefood|ăn uống|an uong|cơm|com |food|restaurant|cafe|coffee)/i.test(text)) return { category: "expense_food", excluded_from_flow: false };
  if (/(grab|be |xanh sm|taxi|xăng|xang|parking|gửi xe|gui xe)/i.test(text)) return { category: "expense_transport", excluded_from_flow: false };
  if (/(shopee|lazada|tiki|mua sắm|mua sam|shopping)/i.test(text)) return { category: "expense_shopping", excluded_from_flow: false };
  return { category: "expense_other", excluded_from_flow: false };
}

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  income_sales: "Thu bán hàng",
  income_service: "Thu dịch vụ",
  income_salary: "Lương",
  income_other: "Thu khác",
  expense_cogs: "Giá vốn / Nhà cung cấp",
  expense_salary: "Lương nhân sự",
  expense_marketing: "Marketing",
  expense_rent: "Thuê mặt bằng",
  expense_utilities: "Điện nước / Internet",
  expense_shipping: "Vận chuyển",
  expense_fee: "Phí ngân hàng",
  expense_tax: "Thuế / Lệ phí",
  expense_food: "Ăn uống",
  expense_transport: "Đi lại",
  expense_shopping: "Mua sắm",
  expense_other: "Chi khác",
  transfer_internal: "Chuyển nội bộ",
  capital: "Góp / Rút vốn",
  loan: "Vay / Trả nợ",
  refund: "Hoàn tiền",
  uncategorized: "Chưa phân loại",
};
