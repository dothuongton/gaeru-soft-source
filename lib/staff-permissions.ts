/** The same permission catalogue drives staff forms and server authorization. */
export const PERMISSIONS = [
 {id:"orders.view",label:"Xem đơn và bàn đang phục vụ",description:"Xem đơn gọi món, lịch sử của lượt khách và yêu cầu hỗ trợ.",group:"Vận hành"},
 {id:"orders.manage",label:"Tiếp nhận và xử lý đơn",description:"Nhận đơn, cập nhật món đang làm, sẵn sàng và đã phục vụ.",group:"Vận hành"},
 {id:"orders.cancel",label:"Hủy đơn",description:"Hủy đơn còn đủ điều kiện và ghi rõ lý do hủy.",group:"Vận hành"},
 {id:"tables.manage",label:"Quản lý bàn và QR",description:"Duyệt hoặc từ chối mở bàn, xử lý hỗ trợ, đóng bàn đủ điều kiện, đổi tên bàn và xem mã QR.",group:"Vận hành"},
 {id:"tables.transfer",label:"Chuyển bàn",description:"Chuyển toàn bộ lượt phục vụ sang một bàn trống.",group:"Vận hành"},
 {id:"payments.collect",label:"Xác nhận thanh toán",description:"Xác nhận tiền đã thu theo từng lần gọi hoặc toàn bộ bàn.",group:"Thu ngân và báo cáo"},
 {id:"revenue.view",label:"Xem doanh thu",description:"Xem doanh thu, lịch sử quyết toán và xuất báo cáo CSV.",group:"Thu ngân và báo cáo"},
 {id:"menu.manage",label:"Quản lý thực đơn",description:"Thêm, sửa món, giá bán, hình ảnh và trạng thái còn món.",group:"Quản trị"},
 {id:"settings.manage",label:"Cài đặt cửa hàng",description:"Cập nhật thông tin quán, màu sắc, kích thước hiển thị và thời gian thông báo.",group:"Quản trị"},
 {id:"staff.manage",label:"Quản lý tài khoản nhân viên",description:"Thêm, phân quyền và tạm khóa tài khoản khác trong phạm vi quyền của mình.",group:"Quản trị"},
] as const;

export type Permission = typeof PERMISSIONS[number]["id"];
export type StaffRole = "manager"|"cashier"|"service"|"kitchen"|"viewer"|"custom";
export type StaffStatus = "active"|"suspended";
export const ALL_PERMISSIONS:Permission[] = PERMISSIONS.map(permission=>permission.id);
export const ORDER_VIEW_DEPENDENTS:Permission[] = ["orders.manage","orders.cancel","tables.manage","tables.transfer","payments.collect"];

export type RolePreset = {id:StaffRole;label:string;description:string;permissions:Permission[]};
export const ROLE_PRESETS:RolePreset[] = [
 {id:"manager",label:"Quản trị cửa hàng",description:"Toàn bộ chức năng của cửa hàng này, bao gồm tạo quản trị và phân quyền nhân viên.",permissions:[...ALL_PERMISSIONS]},
 {id:"cashier",label:"Thu ngân",description:"Theo dõi đơn, quản lý bàn, thu tiền và xem doanh thu.",permissions:["orders.view","tables.manage","tables.transfer","payments.collect","revenue.view"]},
 {id:"service",label:"Phục vụ",description:"Xử lý đơn, hỗ trợ khách, mở, đóng và chuyển bàn.",permissions:["orders.view","orders.manage","tables.manage","tables.transfer"]},
 {id:"kitchen",label:"Bếp",description:"Xem và cập nhật tiến độ chuẩn bị món.",permissions:["orders.view","orders.manage"]},
 {id:"viewer",label:"Xem báo cáo",description:"Xem doanh thu và lịch sử quyết toán.",permissions:["revenue.view"]},
 {id:"custom",label:"Tùy chỉnh",description:"Chọn riêng từng quyền phù hợp với công việc.",permissions:[]},
];

export type StaffAccount = {
 id:string;email:string;name:string;role:StaffRole;permissions:Permission[];status:StaffStatus;
 protected:boolean;userBound:boolean;version:number;createdAt:number|null;updatedAt:number|null;lastLoginAt:number|null;
};
export type StaffProfile = {fullName:string;contactEmail:string;phone:string;avatar:string;updatedAt:number};
export type StaffAccess = {
 profile?:StaffProfile;
 authenticated:boolean;userId:string|null;email:string|null;isStaff:boolean;isOwner:boolean;
 account:StaffAccount|null;permissions:Permission[];
};
export type StaffAudit = {
 id:string;actorEmail:string;accountId:string;accountEmail:string;
 action:"created"|"updated"|"suspended"|"reactivated";
 before:StaffAccount|null;after:StaffAccount;createdAt:number;
};
export type StaffAccountsResponse = {accounts:StaffAccount[];audit:StaffAudit[]};
export type StaffAccountResult = {ok:true;account:StaffAccount};

/** Unknown permission IDs fail validation rather than becoming silent grants. */
export function normalizePermissions(raw:unknown):Permission[]{
 if(!Array.isArray(raw)||raw.some(value=>typeof value!=="string"||!ALL_PERMISSIONS.includes(value as Permission)))throw new Error("Danh sách quyền không hợp lệ.");
 const chosen=new Set(raw as Permission[]);
 if(ORDER_VIEW_DEPENDENTS.some(permission=>chosen.has(permission)))chosen.add("orders.view");
 return ALL_PERMISSIONS.filter(permission=>chosen.has(permission));
}

export function hasPermission(access:Pick<StaffAccess,"isStaff"|"permissions">|null|undefined,permission:Permission):boolean{
 return !!access?.isStaff&&access.permissions.includes(permission);
}
export function canGrantPermissions(access:StaffAccess,permissions:readonly Permission[]):boolean{
 return hasPermission(access,"staff.manage")&&permissions.every(permission=>access.permissions.includes(permission));
}
export function canManageAccount(access:StaffAccess,account:StaffAccount):boolean{
 return !account.protected&&account.id!==access.account?.id&&canGrantPermissions(access,account.permissions);
}
export function normalizeStaffEmail(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const email=value.trim().toLowerCase();
 return email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>.]+$/.test(email)?email:null;
}
