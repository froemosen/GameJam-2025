package spatial

import (
	"math"
	"sync"
)

// Position represents a 3D position
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	Z float64 `json:"z"`
}

// CellKey represents a grid cell coordinate
type CellKey struct {
	X, Z int
}

// Grid implements spatial partitioning for Area of Interest (AOI) management
type Grid struct {
	cellSize     float64
	viewDistance float64
	cells        map[CellKey]map[string]bool // cell -> set of player IDs
	playerCells  map[string]CellKey          // player ID -> cell
	mutex        sync.RWMutex
}

// NewGrid creates a new spatial grid
// cellSize: size of each grid cell (e.g., 50.0 for 50x50 units)
// viewDistance: how far players can see (e.g., 100.0 units)
func NewGrid(cellSize, viewDistance float64) *Grid {
	return &Grid{
		cellSize:     cellSize,
		viewDistance: viewDistance,
		cells:        make(map[CellKey]map[string]bool),
		playerCells:  make(map[string]CellKey),
	}
}

// getCellKey converts a position to a cell key
func (g *Grid) getCellKey(pos Position) CellKey {
	return CellKey{
		X: int(math.Floor(pos.X / g.cellSize)),
		Z: int(math.Floor(pos.Z / g.cellSize)),
	}
}

// UpdatePlayerPosition updates a player's position in the grid
func (g *Grid) UpdatePlayerPosition(playerID string, pos Position) {
	g.mutex.Lock()
	defer g.mutex.Unlock()

	newCell := g.getCellKey(pos)

	// Check if player is already tracked
	if oldCell, exists := g.playerCells[playerID]; exists {
		// If same cell, no need to update
		if oldCell == newCell {
			return
		}

		// Remove from old cell
		if players, ok := g.cells[oldCell]; ok {
			delete(players, playerID)
			if len(players) == 0 {
				delete(g.cells, oldCell)
			}
		}
	}

	// Add to new cell
	if g.cells[newCell] == nil {
		g.cells[newCell] = make(map[string]bool)
	}
	g.cells[newCell][playerID] = true
	g.playerCells[playerID] = newCell
}

// RemovePlayer removes a player from the grid
func (g *Grid) RemovePlayer(playerID string) {
	g.mutex.Lock()
	defer g.mutex.Unlock()

	if cell, exists := g.playerCells[playerID]; exists {
		if players, ok := g.cells[cell]; ok {
			delete(players, playerID)
			if len(players) == 0 {
				delete(g.cells, cell)
			}
		}
		delete(g.playerCells, playerID)
	}
}

// GetNearbyPlayers returns IDs of players within view distance
func (g *Grid) GetNearbyPlayers(playerID string, playerPos Position) []string {
	g.mutex.RLock()
	defer g.mutex.RUnlock()

	cell, exists := g.playerCells[playerID]
	if !exists {
		return []string{}
	}

	// Calculate how many cells to check based on view distance
	cellRadius := int(math.Ceil(g.viewDistance / g.cellSize))

	nearby := make([]string, 0)
	seen := make(map[string]bool)

	// Check all cells within radius
	for dx := -cellRadius; dx <= cellRadius; dx++ {
		for dz := -cellRadius; dz <= cellRadius; dz++ {
			checkCell := CellKey{
				X: cell.X + dx,
				Z: cell.Z + dz,
			}

			if players, ok := g.cells[checkCell]; ok {
				for pid := range players {
					// Don't include self
					if pid == playerID {
						continue
					}
					// Avoid duplicates
					if seen[pid] {
						continue
					}
					seen[pid] = true
					nearby = append(nearby, pid)
				}
			}
		}
	}

	return nearby
}

// GetPlayerCount returns the total number of tracked players
func (g *Grid) GetPlayerCount() int {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	return len(g.playerCells)
}

// GetCellCount returns the number of active cells
func (g *Grid) GetCellCount() int {
	g.mutex.RLock()
	defer g.mutex.RUnlock()
	return len(g.cells)
}
