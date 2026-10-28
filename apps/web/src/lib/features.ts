// What each job feature is called in the UI. The list itself lives in the schema (FEATURES); the order here is the sidebar's.
export const FEATURE_LABELS: Record<string, string> = {
  video: 'Tạo video',
  marketing: 'Marketing Studio',
  try_on: 'Thử đồ',
  image: 'Tạo ảnh',
  character_swap: 'Đổi nhân vật',
  model_swap: 'Đổi người mẫu',
  jewelry_try_on: 'Thử trang sức',
  background_changer: 'Đổi nền',
  reframe: 'Đổi khung hình',
  image_upscale: 'Tăng độ phân giải',
  face_swap: 'Đổi khuôn mặt',
  background_remover: 'Xoá nền',
  motion_control: 'Điều khiển chuyển động',
  media_optimizer: 'Tối ưu media',
};

export const featureLabel = (feature: string | null | undefined): string => (feature ? (FEATURE_LABELS[feature] ?? feature) : 'Không rõ');
