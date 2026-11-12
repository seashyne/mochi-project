// Platform announcements rendered by the News page and the notification panel.

export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  tag: 'PLATFORM' | 'STUDIO' | 'SHOP' | 'COMMUNITY';
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'news_2026_11_10_ui',
    title: 'ปรับปรุงหน้าจอทั้งแพลตฟอร์ม',
    body: 'หน้าหลัก คลังไอเทม เพื่อน ข้อความ และตั้งค่า ใช้งานได้ครบทุกหน้า พร้อมธีมสว่าง/มืดที่ถนอมสายตาและลดแสงสะท้อน',
    date: '2026-11-10',
    tag: 'PLATFORM'
  },
  {
    id: 'news_2026_11_08_studio',
    title: 'Mochi Studio: แก้ไขฉาก 3D และรัน Lua ได้จริง',
    body: 'เพิ่มตัวเลือกวัตถุ ลากย้าย ปรับสี และทดสอบสคริปต์ Lua 5.4 ในแซนด์บ็อกซ์ ก่อนเผยแพร่เป็นโลก 3D',
    date: '2026-11-08',
    tag: 'STUDIO'
  },
  {
    id: 'news_2026_11_07_shop',
    title: 'ร้านค้าไอเทมเริ่มเปิดให้ใช้งาน',
    body: 'ซื้อไอเทมด้วยเหรียญ Mochi แล้วสวมใส่กับอวาตาร์ได้ทันที รายการที่ซื้อจะอยู่ในหน้าคลังไอเทม',
    date: '2026-11-07',
    tag: 'SHOP'
  },
  {
    id: 'news_2026_11_05_avatar',
    title: 'อวาตาร์ 6 ส่วน ปรับสีได้อิสระ',
    body: 'เลือกสีหัว ลำตัว แขน และขาแยกส่วนได้ พร้อมหมวกและเสื้อจากแคตตาล็อกคลาวด์',
    date: '2026-11-05',
    tag: 'PLATFORM'
  },
  {
    id: 'news_2026_11_01_multiplayer',
    title: 'ห้องผู้เล่นหลายคนบน Durable Objects',
    body: 'ซิงก์ตำแหน่งผู้เล่นที่ 60Hz พร้อมแชทในห้อง และสถานะการเชื่อมต่อแบบเรียลไทม์',
    date: '2026-11-01',
    tag: 'COMMUNITY'
  },
  {
    id: 'news_2026_10_28_launch',
    title: 'ยินดีต้อนรับสู่ Mochi',
    body: 'แพลตฟอร์มเกม 3D บนเว็บ เล่นได้ทันทีในเบราว์เซอร์ ไม่ต้องติดตั้งเพิ่ม',
    date: '2026-10-28',
    tag: 'COMMUNITY'
  }
];

export function getAnnouncement(id: string): Announcement | undefined {
  return ANNOUNCEMENTS.find((item) => item.id === id);
}
