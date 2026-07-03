/**
 * stationPanelStatus.js — 네트워크 패널 통합 상태 문구
 */

/**
 * @param {{ online: boolean, credentials: { name: string } | null, participating: boolean }} params
 */
export function buildNetworkPanelStatus({ online, credentials, participating }) {
  if (!online) {
    return {
      tone: 'offline',
      label: '서버 미연결',
      detail: '집계 서버에 연결할 수 없습니다.',
    }
  }

  if (!credentials) {
    return {
      tone: 'setup',
      label: '등록 필요',
      detail: '스테이션 등록 후 네트워크에 참여할 수 있습니다.',
    }
  }

  if (participating) {
    return {
      tone: 'active',
      label: `${credentials.name} · 참여 중`,
      detail: '비중·스냅샷 업로드 · 그룹 목표 적용',
    }
  }

  return {
    tone: 'ready',
    label: `${credentials.name} · 미참여`,
    detail: '참여를 켜면 데이터가 그룹에 집계됩니다.',
  }
}
