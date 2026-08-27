import { describe, expect, it } from 'vitest'
import { mergeByIdPreferLocal } from './manualMerge.js'

describe('mergeByIdPreferLocal', () => {
  it('서버만 있으면 서버 항목을 복원한다', () => {
    const result = mergeByIdPreferLocal([], [{ id: 'a1', name: '서버자산' }])
    expect(result.merged).toHaveLength(1)
    expect(result.addedFromServer).toBe(1)
    expect(result.localOnly).toBe(0)
  })

  it('local만 있으면 local을 유지하고 localOnly를 센다', () => {
    const result = mergeByIdPreferLocal([{ id: 'l1', name: '로컬' }], [])
    expect(result.merged).toHaveLength(1)
    expect(result.localOnly).toBe(1)
    expect(result.addedFromServer).toBe(0)
  })

  it('동일 ID는 local을 유지하고 서버 전용만 추가한다', () => {
    const result = mergeByIdPreferLocal(
      [{ id: 'same', name: '로컬버전' }],
      [
        { id: 'same', name: '서버버전' },
        { id: 's2', name: '서버만' },
      ],
    )
    expect(result.merged).toHaveLength(2)
    expect(result.merged.find((item) => item.id === 'same').name).toBe('로컬버전')
    expect(result.addedFromServer).toBe(1)
  })
})
