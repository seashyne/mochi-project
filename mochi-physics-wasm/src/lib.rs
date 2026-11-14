// Mochi Platform - High-Performance 3D Physics WebAssembly Kernel
// Proprietary and Confidential - Copyright (c) 2026 Mochi Platform

use std::alloc::{alloc, dealloc, Layout};
use std::collections::{HashMap, HashSet};

/// Allocate f32 buffer in WebAssembly linear memory for zero-copy data passing
#[no_mangle]
pub extern "C" fn alloc_f32_buffer(count: usize) -> *mut f32 {
    let layout = Layout::array::<f32>(count).unwrap();
    unsafe { alloc(layout) as *mut f32 }
}

/// Free f32 buffer in WebAssembly linear memory
#[no_mangle]
pub extern "C" fn free_f32_buffer(ptr: *mut f32, count: usize) {
    if !ptr.is_null() && count > 0 {
        let layout = Layout::array::<f32>(count).unwrap();
        unsafe { dealloc(ptr as *mut u8, layout) };
    }
}

/// Compute Euclidean 3D vector length
#[no_mangle]
pub extern "C" fn vec3_length(x: f32, y: f32, z: f32) -> f32 {
    (x * x + y * y + z * z).sqrt()
}

/// Compute 3D Euclidean distance between two points
#[no_mangle]
pub extern "C" fn vec3_distance(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32) -> f32 {
    let dx = ax - bx;
    let dy = ay - by;
    let dz = az - bz;
    (dx * dx + dy * dy + dz * dz).sqrt()
}

/// Compute 3D dot product
#[no_mangle]
pub extern "C" fn vec3_dot(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32) -> f32 {
    ax * bx + ay * by + az * bz
}

/// Semi-implicit Euler integration step for rigid body dynamics
/// Updates velocity and position with linear damping:
/// vel = (vel + accel * dt) * (1.0 - damping * dt)
/// pos = pos + vel * dt
#[no_mangle]
pub extern "C" fn integrate_body(
    pos_ptr: *mut f32,
    vel_ptr: *mut f32,
    accel_x: f32,
    accel_y: f32,
    accel_z: f32,
    dt: f32,
    damping: f32,
) {
    if pos_ptr.is_null() || vel_ptr.is_null() {
        return;
    }
    unsafe {
        let damp_factor = (1.0 - damping * dt).max(0.0);
        let vx = (*vel_ptr.add(0) + accel_x * dt) * damp_factor;
        let vy = (*vel_ptr.add(1) + accel_y * dt) * damp_factor;
        let vz = (*vel_ptr.add(2) + accel_z * dt) * damp_factor;

        *vel_ptr.add(0) = vx;
        *vel_ptr.add(1) = vy;
        *vel_ptr.add(2) = vz;

        *pos_ptr.add(0) += vx * dt;
        *pos_ptr.add(1) += vy * dt;
        *pos_ptr.add(2) += vz * dt;
    }
}

/// Test Sphere vs Sphere intersection
/// If colliding, returns 1 and writes normal (nx, ny, nz) and penetration depth into out_contact[0..4]
/// Otherwise returns 0
#[no_mangle]
pub extern "C" fn test_sphere_sphere(
    ax: f32, ay: f32, az: f32, ar: f32,
    bx: f32, by: f32, bz: f32, br: f32,
    out_contact: *mut f32,
) -> i32 {
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    let radius_sum = ar + br;

    if dist_sq >= radius_sum * radius_sum {
        return 0;
    }

    let dist = dist_sq.sqrt();
    let penetration = radius_sum - dist;

    if !out_contact.is_null() {
        unsafe {
            if dist > 0.00001 {
                let inv = 1.0 / dist;
                *out_contact.add(0) = dx * inv;
                *out_contact.add(1) = dy * inv;
                *out_contact.add(2) = dz * inv;
            } else {
                *out_contact.add(0) = 0.0;
                *out_contact.add(1) = 1.0;
                *out_contact.add(2) = 0.0;
            }
            *out_contact.add(3) = penetration;
        }
    }
    1
}

/// Test Sphere vs Axis-Aligned Bounding Box (AABB)
/// Returns 1 if colliding, 0 if not.
/// Writes contact normal (nx, ny, nz) pointing out of box, and penetration depth into out_contact[0..4]
#[no_mangle]
pub extern "C" fn test_sphere_aabb(
    sx: f32, sy: f32, sz: f32, sr: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
    out_contact: *mut f32,
) -> i32 {
    let cx = sx.max(min_x).min(max_x);
    let cy = sy.max(min_y).min(max_y);
    let cz = sz.max(min_z).min(max_z);

    let dx = sx - cx;
    let dy = sy - cy;
    let dz = sz - cz;
    let dist_sq = dx * dx + dy * dy + dz * dz;

    if dist_sq > sr * sr {
        return 0;
    }

    // Sphere centre inside the box: exit through the nearest face so the
    // resolver pushes out along the shallowest axis (matches the TS solver).
    if dist_sq <= 0.00000001 {
        let ex = (max_x - sx).min(sx - min_x);
        let ey = (max_y - sy).min(sy - min_y);
        let ez = (max_z - sz).min(sz - min_z);

        let (nx, ny, nz, face_dist) = if ex <= ey && ex <= ez {
            (if sx >= 0.0 { 1.0 } else { -1.0 }, 0.0, 0.0, ex)
        } else if ey <= ez {
            (0.0, if sy >= 0.0 { 1.0 } else { -1.0 }, 0.0, ey)
        } else {
            (0.0, 0.0, if sz >= 0.0 { 1.0 } else { -1.0 }, ez)
        };

        if !out_contact.is_null() {
            unsafe {
                *out_contact.add(0) = nx;
                *out_contact.add(1) = ny;
                *out_contact.add(2) = nz;
                *out_contact.add(3) = sr + face_dist;
            }
        }
        return 1;
    }

    let dist = dist_sq.sqrt();
    let penetration = sr - dist;

    if !out_contact.is_null() {
        unsafe {
            if dist > 0.00001 {
                let inv = 1.0 / dist;
                *out_contact.add(0) = dx * inv;
                *out_contact.add(1) = dy * inv;
                *out_contact.add(2) = dz * inv;
            } else {
                *out_contact.add(0) = 0.0;
                *out_contact.add(1) = 1.0;
                *out_contact.add(2) = 0.0;
            }
            *out_contact.add(3) = penetration;
        }
    }
    1
}

/// Test Axis-Aligned Bounding Box (AABB) vs AABB overlap
#[no_mangle]
pub extern "C" fn test_aabb_aabb(
    min_ax: f32, min_ay: f32, min_az: f32,
    max_ax: f32, max_ay: f32, max_az: f32,
    min_bx: f32, min_by: f32, min_bz: f32,
    max_bx: f32, max_by: f32, max_bz: f32,
) -> i32 {
    if max_ax < min_bx || min_ax > max_bx {
        return 0;
    }
    if max_ay < min_by || min_ay > max_by {
        return 0;
    }
    if max_az < min_bz || min_az > max_bz {
        return 0;
    }
    1
}

/// Fast Ray vs AABB slab intersection test (used for cursor picking, clicking objects, and line-of-sight)
/// Returns hit distance `t >= 0.0`, or `-1.0` if no intersection occurs within max_dist
#[no_mangle]
pub extern "C" fn ray_intersect_aabb(
    orig_x: f32, orig_y: f32, orig_z: f32,
    dir_x: f32, dir_y: f32, dir_z: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
    max_dist: f32,
) -> f32 {
    let mut tmin = 0.0f32;
    let mut tmax = max_dist;

    // X slab
    if dir_x.abs() > 0.000001 {
        let inv_d = 1.0 / dir_x;
        let mut t1 = (min_x - orig_x) * inv_d;
        let mut t2 = (max_x - orig_x) * inv_d;
        if t1 > t2 { std::mem::swap(&mut t1, &mut t2); }
        tmin = tmin.max(t1);
        tmax = tmax.min(t2);
        if tmin > tmax { return -1.0; }
    } else if orig_x < min_x || orig_x > max_x {
        return -1.0;
    }

    // Y slab
    if dir_y.abs() > 0.000001 {
        let inv_d = 1.0 / dir_y;
        let mut t1 = (min_y - orig_y) * inv_d;
        let mut t2 = (max_y - orig_y) * inv_d;
        if t1 > t2 { std::mem::swap(&mut t1, &mut t2); }
        tmin = tmin.max(t1);
        tmax = tmax.min(t2);
        if tmin > tmax { return -1.0; }
    } else if orig_y < min_y || orig_y > max_y {
        return -1.0;
    }

    // Z slab
    if dir_z.abs() > 0.000001 {
        let inv_d = 1.0 / dir_z;
        let mut t1 = (min_z - orig_z) * inv_d;
        let mut t2 = (max_z - orig_z) * inv_d;
        if t1 > t2 { std::mem::swap(&mut t1, &mut t2); }
        tmin = tmin.max(t1);
        tmax = tmax.min(t2);
        if tmin > tmax { return -1.0; }
    } else if orig_z < min_z || orig_z > max_z {
        return -1.0;
    }

    if tmin >= 0.0 { tmin } else { -1.0 }
}

/// Ray vs AABB returning both the entry distance and the outward face normal.
/// Writes `(nx, ny, nz)` into `out_normal` and returns `t >= 0.0`, or `-1.0`.
#[no_mangle]
pub extern "C" fn ray_intersect_aabb_normal(
    orig_x: f32, orig_y: f32, orig_z: f32,
    dir_x: f32, dir_y: f32, dir_z: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
    max_dist: f32,
    out_normal: *mut f32,
) -> f32 {
    let mut tmin = 0.0f32;
    let mut tmax = max_dist;
    let mut axis = 0usize;
    let mut sign = 1.0f32;

    macro_rules! slab {
        ($o:expr, $d:expr, $mn:expr, $mx:expr, $idx:expr) => {{
            if $d.abs() > 0.000001 {
                let inv_d = 1.0 / $d;
                let mut t1 = ($mn - $o) * inv_d;
                let mut t2 = ($mx - $o) * inv_d;
                let mut face_sign = -1.0f32;
                if t1 > t2 {
                    std::mem::swap(&mut t1, &mut t2);
                    face_sign = 1.0;
                }
                if t1 > tmin {
                    tmin = t1;
                    axis = $idx;
                    sign = face_sign;
                }
                tmax = tmax.min(t2);
                if tmin > tmax {
                    return -1.0;
                }
            } else if $o < $mn || $o > $mx {
                return -1.0;
            }
        }};
    }

    slab!(orig_x, dir_x, min_x, max_x, 0);
    slab!(orig_y, dir_y, min_y, max_y, 1);
    slab!(orig_z, dir_z, min_z, max_z, 2);

    if tmin < 0.0 {
        return -1.0;
    }

    if !out_normal.is_null() {
        unsafe {
            *out_normal = if axis == 0 { sign } else { 0.0 };
            *out_normal.add(1) = if axis == 1 { sign } else { 0.0 };
            *out_normal.add(2) = if axis == 2 { sign } else { 0.0 };
        }
    }

    tmin
}

/// Character capsule / AABB ground step resolver
/// Resolves avatar vertical stand and horizontal penetration against solid bounding box
#[no_mangle]
pub extern "C" fn resolve_character_box_collision(
    px: f32, py: f32, pz: f32,
    radius: f32, half_height: f32,
    min_x: f32, min_y: f32, min_z: f32,
    max_x: f32, max_y: f32, max_z: f32,
    out_pos: *mut f32,
) -> i32 {
    let char_min_x = px - radius;
    let char_max_x = px + radius;
    let char_min_y = py;
    let char_max_y = py + half_height * 2.0;
    let char_min_z = pz - radius;
    let char_max_z = pz + radius;

    // Fast rejection test
    if char_max_x < min_x || char_min_x > max_x ||
       char_max_y < min_y || char_min_y > max_y ||
       char_max_z < min_z || char_min_z > max_z {
        return 0;
    }

    if out_pos.is_null() {
        return 1;
    }

    // Find smallest axis of penetration
    let overlap_x1 = max_x - char_min_x;
    let overlap_x2 = char_max_x - min_x;
    let pen_x = if overlap_x1 < overlap_x2 { overlap_x1 } else { -overlap_x2 };

    let overlap_y1 = max_y - char_min_y;
    let overlap_y2 = char_max_y - min_y;
    let pen_y = if overlap_y1 < overlap_y2 { overlap_y1 } else { -overlap_y2 };

    let overlap_z1 = max_z - char_min_z;
    let overlap_z2 = char_max_z - min_z;
    let pen_z = if overlap_z1 < overlap_z2 { overlap_z1 } else { -overlap_z2 };

    let abs_x = pen_x.abs();
    let abs_y = pen_y.abs();
    let abs_z = pen_z.abs();

    unsafe {
        *out_pos.add(0) = px;
        *out_pos.add(1) = py;
        *out_pos.add(2) = pz;

        if abs_y <= abs_x && abs_y <= abs_z {
            *out_pos.add(1) = py + pen_y;
        } else if abs_x <= abs_z {
            *out_pos.add(0) = px + pen_x;
        } else {
            *out_pos.add(2) = pz + pen_z;
        }
    }
    1
}

/// Bakes a walkability bitmap plus connected walkable regions from box footprints.
///
/// `boxes` holds four f32 per box: `min_x, max_x, min_z, max_z` in world space.
/// Each footprint is inflated by `agent_radius` before rasterising, so a walkable
/// cell is one an agent's centre can occupy. Cell coverage follows the same rule
/// as the TypeScript reference in `engine/navigation/navGridFromScene.ts`: the
/// first covered cell contains the min edge, the last is the cell that actually
/// overlaps the max edge.
///
/// `walkable_out` receives 1 per walkable cell and 0 per blocked cell.
/// `region_out` receives 1..=n for walkable cells, 0 for blocked ones. Regions are
/// 4-way connected: the pathfinder refuses corner cutting, so a diagonal-only
/// link is not a link. Returns the number of regions.
#[no_mangle]
pub extern "C" fn bake_nav_grid(
    boxes: *const f32,
    box_count: usize,
    origin_x: f32,
    origin_z: f32,
    cell_size: f32,
    width: usize,
    height: usize,
    agent_radius: f32,
    walkable_out: *mut u8,
    region_out: *mut u32,
) -> u32 {
    if walkable_out.is_null() || region_out.is_null() || width == 0 || height == 0 {
        return 0;
    }
    if !(cell_size > 0.0) || !(agent_radius >= 0.0) {
        return 0;
    }

    let cells = width * height;
    let walkable = unsafe { std::slice::from_raw_parts_mut(walkable_out, cells) };
    let region = unsafe { std::slice::from_raw_parts_mut(region_out, cells) };

    // Slice fills compile to a memset; an indexed loop over 262k cells does not.
    walkable.fill(1);
    region.fill(0);

    if !boxes.is_null() && box_count > 0 {
        let boxes = unsafe { std::slice::from_raw_parts(boxes, box_count * 4) };
        for index in 0..box_count {
            let base = index * 4;
            let min_x = boxes[base] - agent_radius;
            let max_x = boxes[base + 1] + agent_radius;
            let min_z = boxes[base + 2] - agent_radius;
            let max_z = boxes[base + 3] + agent_radius;

            let first_x = ((min_x - origin_x) / cell_size).floor() as i64;
            let last_x = ((max_x - origin_x) / cell_size).ceil() as i64 - 1;
            let first_z = ((min_z - origin_z) / cell_size).floor() as i64;
            let last_z = ((max_z - origin_z) / cell_size).ceil() as i64 - 1;

            let x0 = first_x.max(0);
            let x1 = last_x.min(width as i64 - 1);
            let z0 = first_z.max(0);
            let z1 = last_z.min(height as i64 - 1);
            if x1 < x0 || z1 < z0 {
                continue;
            }

            for z in z0..=z1 {
                let row = (z as usize) * width;
                for x in x0..=x1 {
                    walkable[row + x as usize] = 0;
                }
            }
        }
    }

    // Scanline flood fill. The previous version pushed every cell and recovered its
    // coordinates with `%` and `/` - two integer divisions per cell, which dominated
    // the bake at 2.6 ms for a 512x512 grid. Filling whole horizontal runs and only
    // stacking one seed per run removes both costs.
    let mut region_count: u32 = 0;
    let mut stack: Vec<(u32, u32)> = Vec::new();

    for start in 0..cells {
        if walkable[start] == 0 || region[start] != 0 {
            continue;
        }
        region_count += 1;
        stack.push(((start % width) as u32, (start / width) as u32));

        while let Some((seed_x, seed_z)) = stack.pop() {
            let seed_x = seed_x as usize;
            let seed_z = seed_z as usize;
            let row = seed_z * width;
            if walkable[row + seed_x] == 0 || region[row + seed_x] != 0 {
                continue;
            }

            let mut left = seed_x;
            while left > 0 && walkable[row + left - 1] == 1 && region[row + left - 1] == 0 {
                left -= 1;
            }
            let mut right = seed_x;
            while right + 1 < width && walkable[row + right + 1] == 1 && region[row + right + 1] == 0 {
                right += 1;
            }
            for x in left..=right {
                region[row + x] = region_count;
            }

            // One seed per unlabelled span on the rows above and below.
            for delta in [-1i32, 1] {
                let neighbour_z = seed_z as i32 + delta;
                if neighbour_z < 0 || neighbour_z >= height as i32 {
                    continue;
                }
                let neighbour_row = neighbour_z as usize * width;
                let mut x = left;
                while x <= right {
                    if walkable[neighbour_row + x] == 1 && region[neighbour_row + x] == 0 {
                        let mut span_end = x;
                        while span_end + 1 <= right
                            && walkable[neighbour_row + span_end + 1] == 1
                            && region[neighbour_row + span_end + 1] == 0
                        {
                            span_end += 1;
                        }
                        stack.push((span_end as u32, neighbour_z as u32));
                        x = span_end + 1;
                    } else {
                        x += 1;
                    }
                }
            }
        }
    }

    region_count
}

/// Decomposes the walkable cells into maximal axis-aligned rectangles.
///
/// This is the polygon stage of the navmesh: `bake_nav_grid` answers "can an agent
/// stand here", and this turns that bitmap into the convex regions the region
/// pathfinder walks. Greedy scan - extend right along the row, then down while the
/// whole span stays free - which tiles the walkable cells exactly. That exactness
/// is what lets the TypeScript reference and this implementation be compared
/// coordinate for coordinate instead of by area.
///
/// Rectangles are the right convex shape here because every obstacle is a box: the
/// free faces of a rectilinear world are axis-aligned. Recast triangulates
/// arbitrary surfaces, which this runtime never has.
///
/// `walkable` holds one byte per cell, 1 for walkable. `rect_out` receives four u32
/// per rectangle: `x0, y0, x1, y1` inclusive cell coordinates. `max_rects` must be
/// at least the number of walkable cells - a rectangle never covers less than one
/// cell - so that bound cannot truncate; the function returns 0 rather than write a
/// partial decomposition if it is wrong.
#[no_mangle]
pub extern "C" fn decompose_navmesh(
    walkable: *const u8,
    width: usize,
    height: usize,
    rect_out: *mut u32,
    max_rects: usize,
) -> u32 {
    if walkable.is_null() || rect_out.is_null() || width == 0 || height == 0 || max_rects == 0 {
        return 0;
    }

    let cells = width * height;
    let walkable = unsafe { std::slice::from_raw_parts(walkable, cells) };
    let out = unsafe { std::slice::from_raw_parts_mut(rect_out, max_rects * 4) };
    let mut visited = vec![0u8; cells];
    let mut count: usize = 0;

    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if visited[index] == 1 || walkable[index] == 0 {
                continue;
            }

            let mut x1 = x;
            while x1 + 1 < width
                && visited[y * width + x1 + 1] == 0
                && walkable[y * width + x1 + 1] == 1
            {
                x1 += 1;
            }

            let mut y1 = y;
            'grow: while y1 + 1 < height {
                let row = (y1 + 1) * width;
                for probe in x..=x1 {
                    if visited[row + probe] == 1 || walkable[row + probe] == 0 {
                        break 'grow;
                    }
                }
                y1 += 1;
            }

            for row in y..=y1 {
                let start = row * width + x;
                let end = start + (x1 - x);
                for cell in start..=end {
                    visited[cell] = 1;
                }
            }

            if count >= max_rects {
                return 0;
            }
            let base = count * 4;
            out[base] = x as u32;
            out[base + 1] = y as u32;
            out[base + 2] = x1 as u32;
            out[base + 3] = y1 as u32;
            count += 1;
        }
    }

    count as u32
}

/// Solves the velocity closest to `opt` that satisfies every half-plane.
///
/// `lines` holds four f32 per constraint: `px, pz, dx, dz` - a point on the
/// boundary and the unit direction along it. The feasible set is the intersection
/// of the half-planes to the right of each direction; the solver walks the
/// constraints in order and re-projects when the candidate falls outside one.
fn orca_solve_on_line(
    lines: &[[f32; 4]],
    line_no: usize,
    radius: f32,
    opt_x: f32,
    opt_z: f32,
    result: &mut [f32; 2],
) -> bool {
    const EPSILON: f32 = 1e-5;
    let [px, pz, dx, dz] = lines[line_no];

    let dot = px * dx + pz * dz;
    let discriminant = dot * dot + radius * radius - (px * px + pz * pz);
    if discriminant < 0.0 {
        return false;
    }

    let root = discriminant.sqrt();
    let mut left = -dot - root;
    let mut right = -dot + root;

    for index in 0..line_no {
        let [opx, opz, odx, odz] = lines[index];
        let denominator = dx * odz - dz * odx;
        let numerator = odx * (pz - opz) - odz * (px - opx);

        if denominator.abs() <= EPSILON {
            if numerator < 0.0 {
                return false;
            }
            continue;
        }

        let t = numerator / denominator;
        if denominator >= 0.0 {
            right = right.min(t);
        } else {
            left = left.max(t);
        }
        if left > right {
            return false;
        }
    }

    let projected = dx * (opt_x - px) + dz * (opt_z - pz);
    let t = if projected < left {
        left
    } else if projected > right {
        right
    } else {
        projected
    };
    result[0] = px + t * dx;
    result[1] = pz + t * dz;
    true
}

/// Solves reciprocal velocity obstacles for a crowd, in the XZ plane.
///
/// Every movable body gets the velocity closest to the one it wanted that stays
/// outside every neighbour's collision cone within `time_horizon`. Bodies with
/// weight 0 (the player, a prop) keep their velocity and only act as constraints;
/// the correction is split by weight, so a mover facing an immovable body absorbs
/// all of it and two movers take half each.
///
/// Flat arrays, two f32 per body for positions and velocities, one for radii,
/// weights and speed caps. Returns the number of bodies written.
#[no_mangle]
pub extern "C" fn orca_solve(
    positions: *const f32,
    velocities: *const f32,
    radii: *const f32,
    weights: *const f32,
    max_speeds: *const f32,
    count: usize,
    time_horizon: f32,
    time_step: f32,
    out_velocities: *mut f32,
) -> u32 {
    const EPSILON: f32 = 1e-5;

    if positions.is_null()
        || velocities.is_null()
        || radii.is_null()
        || weights.is_null()
        || max_speeds.is_null()
        || out_velocities.is_null()
        || count == 0
    {
        return 0;
    }
    if !(time_horizon > 0.0) || !(time_step > 0.0) {
        return 0;
    }

    let pos = unsafe { std::slice::from_raw_parts(positions, count * 2) };
    let vel = unsafe { std::slice::from_raw_parts(velocities, count * 2) };
    let rad = unsafe { std::slice::from_raw_parts(radii, count) };
    let wgt = unsafe { std::slice::from_raw_parts(weights, count) };
    let caps = unsafe { std::slice::from_raw_parts(max_speeds, count) };
    let out = unsafe { std::slice::from_raw_parts_mut(out_velocities, count * 2) };

    let inv_horizon = 1.0 / time_horizon;
    let inv_step = 1.0 / time_step;
    let mut lines: Vec<[f32; 4]> = Vec::with_capacity(count);

    for i in 0..count {
        let vx = vel[i * 2];
        let vz = vel[i * 2 + 1];
        if wgt[i] <= 0.0 {
            out[i * 2] = vx;
            out[i * 2 + 1] = vz;
            continue;
        }

        lines.clear();
        for j in 0..count {
            if i == j {
                continue;
            }

            let rel_x = pos[j * 2] - pos[i * 2];
            let rel_z = pos[j * 2 + 1] - pos[i * 2 + 1];
            let rel_vx = vx - vel[j * 2];
            let rel_vz = vz - vel[j * 2 + 1];
            let dist_sq = rel_x * rel_x + rel_z * rel_z;
            let combined = rad[i] + rad[j];
            let combined_sq = combined * combined;
            let total = wgt[i] + wgt[j];
            let share = if total > 0.0 { wgt[i] / total } else { 0.0 };

            let px;
            let pz;
            let dx;
            let dz;

            if dist_sq > combined_sq {
                let w_x = rel_vx - inv_horizon * rel_x;
                let w_z = rel_vz - inv_horizon * rel_z;
                let w_len_sq = w_x * w_x + w_z * w_z;
                let dot = w_x * rel_x + w_z * rel_z;

                if dot < 0.0 && dot * dot > combined_sq * w_len_sq {
                    let w_len = w_len_sq.sqrt();
                    let unit_x = w_x / w_len;
                    let unit_z = w_z / w_len;
                    dx = unit_z;
                    dz = -unit_x;
                    let correction = combined * inv_horizon - w_len;
                    px = vx + share * correction * unit_x;
                    pz = vz + share * correction * unit_z;
                } else {
                    let leg = (dist_sq - combined_sq).sqrt();
                    if rel_x * w_z - rel_z * w_x > 0.0 {
                        dx = (rel_x * leg - rel_z * combined) / dist_sq;
                        dz = (rel_x * combined + rel_z * leg) / dist_sq;
                    } else {
                        dx = -(rel_x * leg + rel_z * combined) / dist_sq;
                        dz = -(-rel_x * combined + rel_z * leg) / dist_sq;
                    }
                    let dot2 = rel_vx * dx + rel_vz * dz;
                    px = vx + share * (dot2 * dx - rel_vx);
                    pz = vz + share * (dot2 * dz - rel_vz);
                }
            } else {
                let w_x = rel_vx - inv_step * rel_x;
                let w_z = rel_vz - inv_step * rel_z;
                let w_len = (w_x * w_x + w_z * w_z).sqrt();
                if w_len < EPSILON {
                    dx = 0.0;
                    dz = 1.0;
                    px = vx;
                    pz = vz;
                } else {
                    let unit_x = w_x / w_len;
                    let unit_z = w_z / w_len;
                    dx = unit_z;
                    dz = -unit_x;
                    let correction = combined * inv_step - w_len;
                    px = vx + share * correction * unit_x;
                    pz = vz + share * correction * unit_z;
                }
            }

            lines.push([px, pz, dx, dz]);
        }

        // Start from the preferred velocity, clamped to the speed cap, then project
        // onto each constraint in turn. A failed projection keeps the last feasible
        // candidate rather than returning something illegal.
        let cap = caps[i];
        let speed_sq = vx * vx + vz * vz;
        let mut result = if speed_sq > cap * cap {
            let scale = cap / speed_sq.sqrt();
            [vx * scale, vz * scale]
        } else {
            [vx, vz]
        };

        for index in 0..lines.len() {
            let [px, pz, dx, dz] = lines[index];
            if dx * (pz - result[1]) - dz * (px - result[0]) <= 0.0 {
                continue;
            }
            let previous = result;
            if !orca_solve_on_line(&lines, index, cap, vx, vz, &mut result) {
                result = previous;
                break;
            }
        }

        out[i * 2] = result[0];
        out[i * 2 + 1] = result[1];
    }

    count as u32
}

/// Lateral bias applied to the push between two movable bodies. Two agents walking
/// straight at each other would otherwise be pushed exactly opposite their travel
/// and lock; a few degrees of rotation turns the deadlock into a slide past.
const HEAD_ON_BIAS: f32 = 0.15;

/// Separates overlapping discs in the XZ plane, in place.
///
/// `positions` holds `x, z` per body, `radii` one radius per body, and `weights`
/// the share of each push a body takes: 1 for a peer that can move, 0 for
/// something immovable like the player or a prop. A pair is pushed apart along its
/// centre line, each body taking `weight / (weight_i + weight_j)` of the
/// correction, capped at `max_step` per pair per iteration so a deep overlap does
/// not teleport.
///
/// Returns the number of separating moves applied.
#[no_mangle]
pub extern "C" fn resolve_overlaps(
    positions: *mut f32,
    radii: *const f32,
    weights: *const f32,
    count: usize,
    max_step: f32,
    iterations: u32,
) -> u32 {
    if positions.is_null() || radii.is_null() || weights.is_null() || count < 2 {
        return 0;
    }
    if !(max_step > 0.0) {
        return 0;
    }

    let pos = unsafe { std::slice::from_raw_parts_mut(positions, count * 2) };
    let rad = unsafe { std::slice::from_raw_parts(radii, count) };
    let wgt = unsafe { std::slice::from_raw_parts(weights, count) };

    let mut applied: u32 = 0;

    for _ in 0..iterations.max(1) {
        let mut moved = false;
        for i in 0..count {
            for j in (i + 1)..count {
                let total_weight = wgt[i] + wgt[j];
                if !(total_weight > 0.0) {
                    continue;
                }
                let ix = i * 2;
                let iz = i * 2 + 1;
                let jx = j * 2;
                let jz = j * 2 + 1;

                let dx = pos[jx] - pos[ix];
                let dz = pos[jz] - pos[iz];
                let distance_sq = dx * dx + dz * dz;
                let reach = rad[i] + rad[j];
                if !(reach > 0.0) || distance_sq >= reach * reach {
                    continue;
                }

                let distance = distance_sq.sqrt();
                // Exactly coincident centres have no centre line; pick +X so the
                // pair still separates instead of jittering in place.
                let (mut nx, mut nz) = if distance > 1e-6 {
                    (dx / distance, dz / distance)
                } else {
                    (1.0, 0.0)
                };

                // Two moving bodies walking straight at each other get a push that
                // is exactly opposite their travel, so neither ever makes progress
                // and they lock. Rotating the normal a few degrees turns that into a
                // slide past. Applied only to pairs that can both move, so pushing
                // off a wall or the player stays square.
                if wgt[i] > 0.0 && wgt[j] > 0.0 {
                    let biased_x = nx - nz * HEAD_ON_BIAS;
                    let biased_z = nz + nx * HEAD_ON_BIAS;
                    let biased_len = (biased_x * biased_x + biased_z * biased_z).sqrt();
                    if biased_len > 1e-6 {
                        nx = biased_x / biased_len;
                        nz = biased_z / biased_len;
                    }
                }

                let push = (reach - distance).min(max_step);
                let share_i = wgt[i] / total_weight;
                let share_j = wgt[j] / total_weight;

                pos[ix] -= nx * push * share_i;
                pos[iz] -= nz * push * share_i;
                pos[jx] += nx * push * share_j;
                pos[jz] += nz * push * share_j;

                moved = true;
                applied += 1;
            }
        }
        if !moved {
            break;
        }
    }

    applied
}

/// Reads the pixel dimensions of a PNG or JPEG header.
///
/// Writes `width, height` into `out_ptr` and returns 1 on success, 0 for an
/// unknown or truncated format. Only the header is inspected, so this is cheap
/// enough to run on every image an import pulls in.
#[no_mangle]
pub extern "C" fn image_dimensions(data: *const u8, len: usize, out: *mut u32) -> u32 {
    if data.is_null() || out.is_null() || len < 24 {
        return 0;
    }
    let bytes = unsafe { std::slice::from_raw_parts(data, len) };

    // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR with width and height big-endian.
    if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
        let width = be_u32(bytes, 16);
        let height = be_u32(bytes, 20);
        if width == 0 || height == 0 {
            return 0;
        }
        unsafe {
            *out = width;
            *out.add(1) = height;
        }
        return 1;
    }

    // JPEG: walk the segment chain until a start-of-frame marker shows up.
    if bytes[0] == 0xFF && bytes[1] == 0xD8 {
        let mut index = 2usize;
        while index + 9 < len {
            if bytes[index] != 0xFF {
                index += 1;
                continue;
            }
            let marker = bytes[index + 1];
            // Standalone markers carry no length field.
            if marker == 0xD8 || marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
                index += 2;
                continue;
            }
            if marker == 0xD9 || marker == 0xDA {
                break;
            }
            let segment_len = be_u16(bytes, index + 2) as usize;
            if segment_len < 2 {
                return 0;
            }
            let is_sof = (0xC0..=0xCF).contains(&marker)
                && marker != 0xC4
                && marker != 0xC8
                && marker != 0xCC;
            if is_sof {
                let height = be_u16(bytes, index + 5) as u32;
                let width = be_u16(bytes, index + 7) as u32;
                if width == 0 || height == 0 {
                    return 0;
                }
                unsafe {
                    *out = width;
                    *out.add(1) = height;
                }
                return 1;
            }
            index += 2 + segment_len;
        }
    }

    0
}

/// Duration of a WAV or MP3 file in milliseconds. Returns 0 when unknown.
///
/// WAV is exact (data size over byte rate). MP3 is an estimate from the first
/// frame's bitrate, which is what a CBR file needs and what a VBR file gets
/// approximated by; good enough to reject a ten-minute file at import.
#[no_mangle]
pub extern "C" fn audio_duration_ms(data: *const u8, len: usize) -> u32 {
    if data.is_null() || len < 16 {
        return 0;
    }
    let bytes = unsafe { std::slice::from_raw_parts(data, len) };

    if &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        let mut index = 12usize;
        let mut byte_rate = 0u32;
        while index + 8 <= len {
            let id = &bytes[index..index + 4];
            let size = le_u32(bytes, index + 4) as usize;
            if id == b"fmt " && index + 20 <= len {
                byte_rate = le_u32(bytes, index + 16);
            } else if id == b"data" && byte_rate > 0 {
                let data_size = size.min(len - (index + 8));
                return ((data_size as u64 * 1000) / byte_rate as u64) as u32;
            }
            index += 8 + size + (size & 1);
        }
        return 0;
    }

    // MP3: skip an ID3v2 tag, then read bitrate and sample rate from a frame head.
    let mut start = 0usize;
    if len > 10 && &bytes[0..3] == b"ID3" {
        let tag_size = ((bytes[6] as usize & 0x7F) << 21)
            | ((bytes[7] as usize & 0x7F) << 14)
            | ((bytes[8] as usize & 0x7F) << 7)
            | (bytes[9] as usize & 0x7F);
        start = 10 + tag_size;
    }
    while start + 4 <= len {
        if bytes[start] == 0xFF && (bytes[start + 1] & 0xE0) == 0xE0 {
            let version = (bytes[start + 1] >> 3) & 0x03;
            let layer = (bytes[start + 1] >> 1) & 0x03;
            let bitrate_index = (bytes[start + 2] >> 4) & 0x0F;
            // Layer III, MPEG-1 only: the common case, and the only table worth
            // carrying in the kernel.
            if layer == 1 && version == 3 && bitrate_index > 0 && bitrate_index < 15 {
                let kbps = MP3_BITRATES[(bitrate_index - 1) as usize];
                if kbps > 0 {
                    let audio_bytes = len - start;
                    return ((audio_bytes as u64 * 8) / kbps as u64) as u32;
                }
            }
            break;
        }
        start += 1;
    }

    0
}

const MP3_BITRATES: [u32; 14] = [
    32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];

fn be_u16(bytes: &[u8], at: usize) -> u16 {
    ((bytes[at] as u16) << 8) | bytes[at + 1] as u16
}

fn be_u32(bytes: &[u8], at: usize) -> u32 {
    ((bytes[at] as u32) << 24)
        | ((bytes[at + 1] as u32) << 16)
        | ((bytes[at + 2] as u32) << 8)
        | bytes[at + 3] as u32
}

fn le_u32(bytes: &[u8], at: usize) -> u32 {
    (bytes[at] as u32)
        | ((bytes[at + 1] as u32) << 8)
        | ((bytes[at + 2] as u32) << 16)
        | ((bytes[at + 3] as u32) << 24)
}

/// Vertex-clustering mesh decimation for level-of-detail generation.
///
/// Vertices are snapped to a uniform grid of `cell_size` anchored at the mesh
/// minimum; every vertex sharing a cell becomes one cluster. Each cluster is
/// represented by its member closest to the cluster centroid, so the reduced mesh
/// stays on the original surface and every attribute (UV, colour) can be carried
/// over from that same source vertex. Triangles whose corners collapse onto the
/// same cluster, and duplicate triangles, are dropped.
///
/// `out_positions` needs room for `vertex_count * 3` floats and `out_indices` for
/// `index_count` u32s: clustering only ever removes vertices and triangles, so the
/// input sizes are always a safe capacity. `out_source` receives one u32 per
/// output vertex - the index of the source vertex that represents that cluster.
/// `out_counts` receives `[vertex_count_out, index_count_out]`.
///
/// Returns the number of triangles written, or 0 when the input is refused: null
/// pointers, a non-finite position, `cell_size` not positive and finite, an index
/// count that is not a positive multiple of three, or an out-of-range index. A
/// mesh that collapses to nothing also returns 0; callers must keep the original
/// level in that case.
#[no_mangle]
pub extern "C" fn simplify_mesh(
    positions: *const f32,
    vertex_count: usize,
    indices: *const u32,
    index_count: usize,
    cell_size: f32,
    out_positions: *mut f32,
    out_indices: *mut u32,
    out_source: *mut u32,
    out_counts: *mut u32,
) -> u32 {
    if positions.is_null()
        || indices.is_null()
        || out_positions.is_null()
        || out_indices.is_null()
        || out_source.is_null()
        || out_counts.is_null()
    {
        return 0;
    }
    if vertex_count == 0
        || index_count < 3
        || index_count % 3 != 0
        || !(cell_size > 0.0)
        || !cell_size.is_finite()
    {
        return 0;
    }

    let verts = unsafe { std::slice::from_raw_parts(positions, vertex_count * 3) };
    let tris = unsafe { std::slice::from_raw_parts(indices, index_count) };

    // The grid is anchored at the mesh minimum, which keeps every cell index
    // non-negative and makes the key packing below unambiguous.
    let mut min = [f32::INFINITY; 3];
    for index in 0..vertex_count {
        for axis in 0..3 {
            let value = verts[index * 3 + axis];
            if !value.is_finite() {
                return 0;
            }
            if value < min[axis] {
                min[axis] = value;
            }
        }
    }

    let mut clusters: HashMap<(u32, u32, u32), u32> = HashMap::new();
    let mut cluster_of_vertex = vec![0u32; vertex_count];
    // f64 accumulation: the TypeScript reference sums in JS numbers, so both
    // sides agree on the centroid and therefore on the representative vertex.
    let mut sums: Vec<[f64; 3]> = Vec::new();
    let mut counts: Vec<u32> = Vec::new();

    for index in 0..vertex_count {
        let mut key = (0u32, 0u32, 0u32);
        for axis in 0..3 {
            let raw = (verts[index * 3 + axis] - min[axis]) / cell_size;
            // Clamp before the cast: a tiny cell size must not overflow.
            let cell = if !(raw > 0.0) {
                0.0
            } else if raw > 1_000_000.0 {
                1_000_000.0
            } else {
                raw
            };
            let cell = cell.floor() as u32;
            match axis {
                0 => key.0 = cell,
                1 => key.1 = cell,
                _ => key.2 = cell,
            }
        }

        let slot = match clusters.get(&key) {
            Some(found) => *found,
            None => {
                let id = sums.len() as u32;
                clusters.insert(key, id);
                sums.push([0.0; 3]);
                counts.push(0);
                id
            }
        };

        cluster_of_vertex[index] = slot;
        let base = index * 3;
        for axis in 0..3 {
            sums[slot as usize][axis] += verts[base + axis] as f64;
        }
        counts[slot as usize] += 1;
    }

    // Representative vertex per cluster: the member closest to the centroid.
    // Strictly-less keeps the first member on a tie, which the TypeScript
    // reference reproduces by scanning in the same order.
    let cluster_count = sums.len();
    let mut best_source = vec![0u32; cluster_count];
    let mut best_distance = vec![f64::INFINITY; cluster_count];
    for index in 0..vertex_count {
        let slot = cluster_of_vertex[index] as usize;
        let divisor = counts[slot].max(1) as f64;
        let base = index * 3;
        let mut distance = 0.0f64;
        for axis in 0..3 {
            let delta = verts[base + axis] as f64 - sums[slot][axis] / divisor;
            distance += delta * delta;
        }
        if distance < best_distance[slot] {
            best_distance[slot] = distance;
            best_source[slot] = index as u32;
        }
    }

    let out_pos = unsafe { std::slice::from_raw_parts_mut(out_positions, cluster_count * 3) };
    let out_src = unsafe { std::slice::from_raw_parts_mut(out_source, cluster_count) };
    for slot in 0..cluster_count {
        let source = best_source[slot] as usize;
        out_src[slot] = best_source[slot];
        for axis in 0..3 {
            out_pos[slot * 3 + axis] = verts[source * 3 + axis];
        }
    }

    let mut seen: HashSet<(u32, u32, u32)> = HashSet::new();
    let out_idx = unsafe { std::slice::from_raw_parts_mut(out_indices, index_count) };
    let mut written = 0usize;
    for tri in 0..(index_count / 3) {
        let base = tri * 3;
        let mut corners = [0u32; 3];
        for corner in 0..3 {
            let raw = tris[base + corner] as usize;
            if raw >= vertex_count {
                return 0;
            }
            corners[corner] = cluster_of_vertex[raw];
        }
        if corners[0] == corners[1] || corners[1] == corners[2] || corners[0] == corners[2] {
            continue;
        }
        let mut key = corners;
        key.sort_unstable();
        if !seen.insert((key[0], key[1], key[2])) {
            continue;
        }
        out_idx[written] = corners[0];
        out_idx[written + 1] = corners[1];
        out_idx[written + 2] = corners[2];
        written += 3;
    }

    unsafe {
        let counts_out = std::slice::from_raw_parts_mut(out_counts, 2);
        counts_out[0] = cluster_count as u32;
        counts_out[1] = written as u32;
    }

    (written / 3) as u32
}

// ---------------------------------------------------------------------------
// Software occlusion culling
//
// A coarse w-buffer: every pixel stores 1/w of the nearest occluder surface. 1/w
// is linear in screen space under perspective, so it can be interpolated across a
// triangle without perspective correction; NDC z cannot, and interpolating it
// would order surfaces wrongly on large faces.
// ---------------------------------------------------------------------------

#[inline]
fn project_corner(vp: &[f32], x: f32, y: f32, z: f32) -> Option<(f32, f32, f32)> {
    // Column-major 4x4, matching THREE.Matrix4.elements.
    let cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    let cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    let cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if !(cw > 1e-6) {
        // At or behind the eye plane: the projection is not a rectangle any more.
        return None;
    }
    let inv = 1.0 / cw;
    Some((cx * inv, cy * inv, inv))
}

#[inline]
fn screen_x(ndc_x: f32, width: usize) -> f32 {
    (ndc_x * 0.5 + 0.5) * width as f32
}

#[inline]
fn screen_y(ndc_y: f32, height: usize) -> f32 {
    (0.5 - ndc_y * 0.5) * height as f32
}

/// Fills one triangle, keeping the nearest (largest 1/w) surface per pixel.
fn raster_triangle(
    depth: &mut [f32],
    width: usize,
    height: usize,
    v: [(f32, f32, f32); 3],
) {
    let min_x = v[0].0.min(v[1].0).min(v[2].0).floor();
    let max_x = v[0].0.max(v[1].0).max(v[2].0).ceil();
    let min_y = v[0].1.min(v[1].1).min(v[2].1).floor();
    let max_y = v[0].1.max(v[1].1).max(v[2].1).ceil();

    let start_x = min_x.max(0.0) as isize;
    let end_x = (max_x.min((width - 1) as f32)) as isize;
    let start_y = min_y.max(0.0) as isize;
    let end_y = (max_y.min((height - 1) as f32)) as isize;
    if start_x > end_x || start_y > end_y {
        return;
    }

    let (x0, y0, w0) = v[0];
    let (x1, y1, w1) = v[1];
    let (x2, y2, w2) = v[2];
    let area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if area.abs() < 1e-9 {
        return;
    }
    let inv_area = 1.0 / area;

    for py in start_y..=end_y {
        let cy = py as f32 + 0.5;
        for px in start_x..=end_x {
            let cx = px as f32 + 0.5;
            let b0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv_area;
            let b1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv_area;
            let b2 = 1.0 - b0 - b1;
            if b0 < -0.0001 || b1 < -0.0001 || b2 < -0.0001 {
                continue;
            }
            let inv_w = b0 * w0 + b1 * w1 + b2 * w2;
            let index = py as usize * width + px as usize;
            if inv_w > depth[index] {
                depth[index] = inv_w;
            }
        }
    }
}

const BOX_FACES: [[usize; 4]; 6] = [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [4, 5, 1, 0],
    [3, 2, 6, 7],
];

/// Reads six floats of a box and returns its eight corners.
#[inline]
fn box_corners(boxes: &[f32], index: usize) -> Option<[(f32, f32, f32); 8]> {
    let base = index * 6;
    let (min_x, min_y, min_z) = (boxes[base], boxes[base + 1], boxes[base + 2]);
    let (max_x, max_y, max_z) = (boxes[base + 3], boxes[base + 4], boxes[base + 5]);
    if !(min_x <= max_x && min_y <= max_y && min_z <= max_z) {
        return None;
    }
    Some([
        (min_x, min_y, min_z),
        (max_x, min_y, min_z),
        (max_x, max_y, min_z),
        (min_x, max_y, min_z),
        (min_x, min_y, max_z),
        (max_x, min_y, max_z),
        (max_x, max_y, max_z),
        (min_x, max_y, max_z),
    ])
}

/// Rasterises static box occluders into a w-buffer of `width * height` floats.
///
/// `view_proj` is 16 floats, column-major, already multiplied view * projection.
/// The buffer is cleared to 0 (nothing occludes) on entry. Boxes that straddle the
/// eye plane are skipped: their projection is not a rectangle, and skipping only
/// loses occlusion, never invents it. Returns the number of boxes rasterised.
#[no_mangle]
pub extern "C" fn rasterize_occluders(
    boxes: *const f32,
    box_count: usize,
    view_proj: *const f32,
    width: usize,
    height: usize,
    depth_out: *mut f32,
) -> u32 {
    if boxes.is_null() || view_proj.is_null() || depth_out.is_null() {
        return 0;
    }
    if width == 0 || height == 0 {
        return 0;
    }

    let vp = unsafe { std::slice::from_raw_parts(view_proj, 16) };
    let pixels = width * height;
    let depth = unsafe { std::slice::from_raw_parts_mut(depth_out, pixels) };
    for pixel in depth.iter_mut() {
        *pixel = 0.0;
    }
    if box_count == 0 {
        return 0;
    }

    let boxes = unsafe { std::slice::from_raw_parts(boxes, box_count * 6) };
    let mut drawn = 0u32;

    for index in 0..box_count {
        let Some(corners) = box_corners(boxes, index) else {
            continue;
        };
        let mut screen = [(0.0f32, 0.0f32, 0.0f32); 8];
        let mut clipped = false;
        for corner in 0..8 {
            let (x, y, z) = corners[corner];
            match project_corner(vp, x, y, z) {
                Some((ndc_x, ndc_y, inv_w)) => {
                    screen[corner] = (screen_x(ndc_x, width), screen_y(ndc_y, height), inv_w);
                }
                None => {
                    clipped = true;
                    break;
                }
            }
        }
        if clipped {
            continue;
        }

        for face in BOX_FACES.iter() {
            let a = screen[face[0]];
            let b = screen[face[1]];
            let c = screen[face[2]];
            let d = screen[face[3]];
            raster_triangle(depth, width, height, [a, b, c]);
            raster_triangle(depth, width, height, [a, c, d]);
        }
        drawn += 1;
    }

    drawn
}

/// Tests candidate boxes against a w-buffer built by `rasterize_occluders`.
///
/// A candidate is occluded when every pixel of its screen rectangle is covered by a
/// surface at least `depth_bias` closer (in 1/w terms). `inset` shrinks the test
/// rectangle by that many pixels so a one-pixel silhouette sliver does not keep an
/// entire object alive. Rectangles larger than `max_pixels` are reported visible:
/// testing them costs more than drawing them. Writes one byte per candidate.
#[no_mangle]
pub extern "C" fn test_occlusion(
    boxes: *const f32,
    box_count: usize,
    view_proj: *const f32,
    width: usize,
    height: usize,
    depth: *const f32,
    depth_bias: f32,
    inset: u32,
    max_pixels: u32,
    out_flags: *mut u8,
) -> u32 {
    if boxes.is_null() || view_proj.is_null() || depth.is_null() || out_flags.is_null() {
        return 0;
    }
    if width == 0 || height == 0 || box_count == 0 {
        return 0;
    }

    let vp = unsafe { std::slice::from_raw_parts(view_proj, 16) };
    let depth = unsafe { std::slice::from_raw_parts(depth, width * height) };
    let boxes = unsafe { std::slice::from_raw_parts(boxes, box_count * 6) };
    let flags = unsafe { std::slice::from_raw_parts_mut(out_flags, box_count) };
    let bias = if depth_bias > 0.0 { 1.0 + depth_bias } else { 1.0 };

    let mut occluded = 0u32;

    for index in 0..box_count {
        flags[index] = 0;
        let Some(corners) = box_corners(boxes, index) else {
            continue;
        };

        let mut min_x = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut nearest = 0.0f32;
        let mut clipped = false;

        for corner in 0..8 {
            let (x, y, z) = corners[corner];
            match project_corner(vp, x, y, z) {
                Some((ndc_x, ndc_y, inv_w)) => {
                    let sx = screen_x(ndc_x, width);
                    let sy = screen_y(ndc_y, height);
                    if sx < min_x {
                        min_x = sx;
                    }
                    if sx > max_x {
                        max_x = sx;
                    }
                    if sy < min_y {
                        min_y = sy;
                    }
                    if sy > max_y {
                        max_y = sy;
                    }
                    if inv_w > nearest {
                        nearest = inv_w;
                    }
                }
                None => {
                    clipped = true;
                    break;
                }
            }
        }
        if clipped {
            continue;
        }

        let pad = inset as f32;
        let start_x = (min_x + pad).floor().max(0.0) as isize;
        let end_x = (max_x - pad).ceil().min((width - 1) as f32) as isize;
        let start_y = (min_y + pad).floor().max(0.0) as isize;
        let end_y = (max_y - pad).ceil().min((height - 1) as f32) as isize;
        if start_x > end_x || start_y > end_y {
            continue;
        }

        let span_x = (end_x - start_x + 1) as usize;
        let span_y = (end_y - start_y + 1) as usize;
        if max_pixels > 0 && span_x * span_y > max_pixels as usize {
            continue;
        }

        let threshold = nearest * bias;
        let mut covered = true;
        'outer: for py in start_y..=end_y {
            let row = py as usize * width;
            for px in start_x..=end_x {
                if depth[row + px as usize] <= threshold {
                    covered = false;
                    break 'outer;
                }
            }
        }

        if covered {
            flags[index] = 1;
            occluded += 1;
        }
    }

    occluded
}

// ---------------------------------------------------------------------------
// Progressive chunk payload scanning
//
// A chunk payload is `{"chunkId":"...","objects":[ ... ]}`. Streaming the objects
// out of it as the bytes arrive needs byte ranges of the complete elements, and
// finding them means walking the JSON while tracking strings and escapes. That is
// an O(n) byte scan, so it lives here.
// ---------------------------------------------------------------------------

#[inline]
fn json_is_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t' || byte == b'\n' || byte == b'\r'
}

/// Finds the byte range of every complete element of a JSON array.
///
/// `from` points at the first element or at a delimiter between elements; the scan
/// stops at the array's closing `]` or at the first element that is not yet fully
/// received, so a partially downloaded payload is safe to scan. Each element writes
/// two u32s into `out_ranges`: byte offset and byte length. Returns the number of
/// elements written, which is at most `max_ranges`; the caller resumes at the end of
/// the last range and scans again, so repeated calls over a growing buffer stay
/// linear rather than rescanning from the start.
///
/// A non-array start, a null pointer or a truncated element yields 0.
#[no_mangle]
pub extern "C" fn scan_json_array(
    data: *const u8,
    len: usize,
    from: usize,
    out_ranges: *mut u32,
    max_ranges: usize,
) -> u32 {
    if data.is_null() || out_ranges.is_null() || max_ranges == 0 || from >= len {
        return 0;
    }

    let bytes = unsafe { std::slice::from_raw_parts(data, len) };
    let ranges = unsafe { std::slice::from_raw_parts_mut(out_ranges, max_ranges * 2) };
    let mut cursor = from;
    let mut written = 0usize;

    loop {
        while cursor < len && (json_is_space(bytes[cursor]) || bytes[cursor] == b',') {
            cursor += 1;
        }
        if cursor >= len || bytes[cursor] == b']' {
            break;
        }
        if written >= max_ranges {
            break;
        }

        let element_start = cursor;
        let mut depth = 0i32;
        let mut in_string = false;
        let mut escaped = false;
        let mut element_end: Option<usize> = None;

        while cursor < len {
            let byte = bytes[cursor];
            if in_string {
                if escaped {
                    escaped = false;
                } else if byte == b'\\' {
                    escaped = true;
                } else if byte == b'"' {
                    in_string = false;
                }
            } else if byte == b'"' {
                in_string = true;
            } else if byte == b'{' || byte == b'[' {
                depth += 1;
            } else if byte == b'}' {
                if depth == 0 {
                    // A stray closer: the payload is malformed. Report what we have.
                    return written as u32;
                }
                depth -= 1;
            } else if byte == b']' {
                if depth == 0 {
                    element_end = Some(cursor);
                    break;
                }
                depth -= 1;
            } else if byte == b',' && depth == 0 {
                element_end = Some(cursor);
                break;
            }
            cursor += 1;
        }

        let Some(end) = element_end else {
            // The element runs past the bytes we have: wait for more.
            break;
        };

        let mut trimmed = end;
        while trimmed > element_start && json_is_space(bytes[trimmed - 1]) {
            trimmed -= 1;
        }
        if trimmed > element_start {
            ranges[written * 2] = element_start as u32;
            ranges[written * 2 + 1] = (trimmed - element_start) as u32;
            written += 1;
        }
        cursor = end;
    }

    written as u32
}
