import { observer } from 'mobx-react-lite'
import { FloatingPanel } from '../../../common/components'
import { COLUMN_GROUPS } from '../controllers/screenerColumns'
import type { ScreenerController } from '../controllers/ScreenerController'

interface Props {
  controller: ScreenerController
  anchor: HTMLElement
  onClose: () => void
}

export const ColumnsMenu = observer(function ColumnsMenu({ controller, anchor, onClose }: Props) {
  return (
    <FloatingPanel anchorEl={anchor} onClose={onClose} label="Columns" width={380}>
      <div className="pop-head">
        <b>Columns</b>
        <button type="button" className="btn ghost sm" onClick={controller.showAllColumns}>
          Show all
        </button>
      </div>
      {COLUMN_GROUPS.map(([group, label]) => {
        const columns = controller.configurableColumns.filter((c) => c.group === group)
        if (!columns.length) return null
        return (
          <div className="colgrp" key={label}>
            <h4>{label}</h4>
            <div className="colchecks">
              {columns.map((c) => (
                <label className="check" key={c.key}>
                  <input
                    type="checkbox"
                    checked={!controller.hiddenColumns.has(c.key)}
                    onChange={() => controller.toggleColumn(c.key)}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>
        )
      })}
      <p className="pop-foot">The Stock column always stays visible. Shift-click a header to sort by more than one column.</p>
    </FloatingPanel>
  )
})
