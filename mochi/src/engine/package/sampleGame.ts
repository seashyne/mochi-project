// Sample production-grade .mochi game package demonstrating client-server Lua scripting
import { MochiPackageContent } from './types';

export const SAMPLE_CLIENT_LUA = `-- Client-side Obby Runner Controller
local player = players.LocalPlayer
local score = 0

print("[Client] Obby Runner Initialized for " .. player.username)

-- Listen for server replicated score updates
network.OnClientEvent("ScoreUpdated", function(data)
  if data and data.score then
    score = data.score
    ui.setLeaderboard("GlobalScore", score)
    ui.showNotification("Server Synced Score: " .. tostring(score), 2)
  end
end)

-- Listen for server announcements
network.OnClientEvent("ServerAnnouncement", function(data)
  if data and data.message then
    ui.showNotification("[Server] " .. data.message, 3)
  end
end)

-- Coin interaction: requests server verification
local coin = world.findPart("Coin")
if coin then
  coin.onTouch(function(p)
    if p.id == player.id then
      coin.setVisible(false)
      world.playSound("coin_pickup")
      -- Fire RPC to server to validate and award points
      network.FireServer("ClaimCoin", { coinId = "Coin_01", value = 50 })
    end
  end)
end

-- Hazard interaction: notify server
local hazard = world.findPart("Hazard")
if hazard then
  hazard.onTouch(function(p)
    if p.id == player.id then
      player.respawn()
      world.playSound("player_defeat")
      network.FireServer("HitHazard", { hazardId = "Hazard_01" })
    end
  end)
end
`;

export const SAMPLE_SERVER_LUA = `-- Server-side Authoritative Game Logic
print("[Server] GameRoom Obby Authority Initialized")

local playerScores = {}
local totalCoinsClaimed = 0

-- Handle client claiming coin
network.OnServerEvent("ClaimCoin", function(player, data)
  local playerId = player.id or "unknown"
  local currentScore = playerScores[playerId] or 0
  local coinValue = (data and data.value) or 10

  currentScore = currentScore + coinValue
  playerScores[playerId] = currentScore
  totalCoinsClaimed = totalCoinsClaimed + 1

  print("[Server] Awarded " .. coinValue .. " pts to " .. playerId .. ". Total: " .. currentScore)

  -- Update replicated state
  state.set("totalCoinsClaimed", totalCoinsClaimed)
  state.set("topScore", currentScore)

  -- Replicate new score back to the client
  network.FireClient(playerId, "ScoreUpdated", { score = currentScore, totalClaims = totalCoinsClaimed })

  -- Broadcast milestone if score exceeds 100
  if currentScore >= 100 then
    network.Broadcast("ServerAnnouncement", {
      message = player.username .. " reached a milestone score of " .. tostring(currentScore) .. "!"
    })
  end
end)

-- Handle player hazard hit
network.OnServerEvent("HitHazard", function(player, data)
  local playerId = player.id or "unknown"
  print("[Server] Player " .. playerId .. " fell into hazard")
  network.FireClient(playerId, "ServerAnnouncement", { message = "Respawned by Server Authority." })
end)
`;

export const SAMPLE_SHARED_LUA = `-- Shared constants and formulas between Client and Server
local Constants = {
  MAX_PLAYERS = 16,
  COIN_RESPAWN_TIME = 15,
  BASE_SPEED = 12.0
}

function CalculateJumpHeight(boostMultiplier)
  return 10.0 * (boostMultiplier or 1.0)
end

return Constants
`;

export function createSampleMochiPackage(): MochiPackageContent {
  return {
    manifest: {
      formatVersion: '1.0',
      gameId: 'game_cyber_obby_01',
      slug: 'cyber-obby-sample',
      title: 'Cyber Obby Arena',
      version: '1.0.0',
      description: 'Multiplayer cyber parkour showcasing .mochi packages and client/server Lua.',
      author: {
        id: 'usr_mochi_creator',
        displayName: 'Mochi Studio'
      },
      entry: {
        clientScript: 'scripts/main.client.lua',
        serverScript: 'scripts/main.server.lua',
        sceneSnapshot: 'scenes/main.json'
      },
      capabilities: {
        multiplayer: true,
        physics: true,
        audio: true
      },
      publishedAt: '2026-11-09T03:00:00Z'
    },
    scripts: {
      'scripts/main.client.lua': {
        path: 'scripts/main.client.lua',
        role: 'client',
        code: SAMPLE_CLIENT_LUA
      },
      'scripts/main.server.lua': {
        path: 'scripts/main.server.lua',
        role: 'server',
        code: SAMPLE_SERVER_LUA
      },
      'scripts/shared/constants.lua': {
        path: 'scripts/shared/constants.lua',
        role: 'shared',
        code: SAMPLE_SHARED_LUA
      }
    },
    assets: {
      'textures/cyber_grid.png': {
        path: 'textures/cyber_grid.png',
        contentType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        size: 68,
        hash: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      }
    },
    scenes: {
      'scenes/main.json': {
        objects: [
          {
            id: 'spawn_01',
            name: 'SpawnPoint',
            type: 'spawn',
            position: { x: 0, y: 1, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 2, y: 0.2, z: 2 },
            color: '#00a2ff'
          },
          {
            id: 'coin_01',
            name: 'Coin',
            type: 'coin',
            position: { x: 0, y: 2, z: 5 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 0.2, z: 1 },
            color: '#fbbf24'
          },
          {
            id: 'hazard_01',
            name: 'Hazard',
            type: 'hazard',
            position: { x: 0, y: -0.5, z: 10 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 10, y: 0.5, z: 10 },
            color: '#ef4444'
          }
        ]
      }
    }
  };
}
