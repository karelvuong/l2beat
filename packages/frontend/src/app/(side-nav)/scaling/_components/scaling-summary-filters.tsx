'use client'
import { Checkbox } from '~/components/core/checkbox'
import { type ScalingSummaryEntry } from '~/server/features/scaling/summary/get-scaling-summary-entries'
import { cn } from '~/utils/cn'
import { useScalingAssociatedTokensContext } from './scaling-associated-tokens-context'
import { ScalingFilters } from './scaling-filters'

interface Props {
  items: ScalingSummaryEntry[]
  className?: string
  showRollupsOnly?: boolean
}

export function ScalingSummaryFilters({
  items,
  className,
  showRollupsOnly,
}: Props) {
  const { excludeAssociatedTokens, setExcludeAssociatedTokens } =
    useScalingAssociatedTokensContext()

  return (
    <div
      className={cn(
        'flex flex-col gap-2 [@media(min-width:1400px)]:flex-row [@media(min-width:1400px)]:justify-between',
        className,
      )}
    >
      <ScalingFilters
        items={items}
        showRollupsFilter={showRollupsOnly}
        showHostChainFilter
        showDALayerFilter
      />
      <Checkbox
        checked={excludeAssociatedTokens}
        onCheckedChange={(checked) => setExcludeAssociatedTokens(!!checked)}
        className="max-md:ml-4"
      >
        Exclude associated tokens
      </Checkbox>
    </div>
  )
}
