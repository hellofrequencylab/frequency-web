import { describe, expect, it } from 'vitest'
import { csvCell, csvText } from './csv'

describe('console CSV', () => {
  it('quotes a cell holding a comma, quote or line break', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })

  it('neutralises a leading formula character', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-$5')).toBe("'-$5")
    expect(csvCell('@handle')).toBe("'@handle")
  })

  it('joins lines with CRLF', () => {
    expect(csvText([['Week ending', 'Net revenue'], ['Oct 13, 2026', '$1,240']])).toBe('Week ending,Net revenue\r\n"Oct 13, 2026","$1,240"')
  })
})
