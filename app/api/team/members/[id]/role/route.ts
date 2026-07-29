import { NextRequest, NextResponse } from 'next/server';
import { withRoleAuth } from '@/lib/auth/api-helpers';
import type { AuthContext, RouteParams } from '@/lib/auth/api-helpers';
import {
  getTeamMemberById,
  updateTeamMember,
  getRoleIdByName,
  countActiveAdministrators,
} from '@/lib/db/team';
import type { RoleName } from '@/types/auth';

const VALID_ROLES: RoleName[] = ['Administrator', 'Team Lead', 'Estimator', 'Client'];

interface RoleBody {
  role?: string;
}

/**
 * PATCH /api/team/members/[id]/role — Administrator only.
 *
 * Changes a member's role. Roles live in `team_members.role_id`, so this is a
 * single column update — no row ever moves between tables (migration 027
 * emptied the legacy `admins` table for exactly this reason).
 *
 * Changing your OWN role is allowed — an Administrator may demote themselves.
 * That costs them access to this page immediately, but any other
 * Administrator can promote them back, so it is recoverable.
 *
 * What is refused is demoting the last active Administrator, self or not:
 * that would leave the organisation with nobody able to undo it.
 */
export const PATCH = withRoleAuth(
  ['Administrator'],
  async (request: NextRequest, ctx: AuthContext, params?: RouteParams) => {
    const id = params?.id as string;
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

    let body: RoleBody;
    try {
      body = (await request.json()) as RoleBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const nextRole = body.role as RoleName | undefined;
    if (!nextRole || !VALID_ROLES.includes(nextRole)) {
      return NextResponse.json(
        { error: `Role must be one of: ${VALID_ROLES.join(', ')}.` },
        { status: 400 },
      );
    }

    const { data: member, error: fetchError } = await getTeamMemberById(id);
    if (fetchError || !member) {
      return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
    }

    if (member.role === nextRole) {
      return NextResponse.json({ data: member });
    }

    // Demoting an active Administrator — make sure another one survives.
    if (member.role === 'Administrator' && member.status === 'Active') {
      const { data: remaining, error: countError } = await countActiveAdministrators(id);
      if (countError) {
        return NextResponse.json({ error: 'Could not verify Administrator count.' }, { status: 500 });
      }
      if ((remaining ?? 0) === 0) {
        return NextResponse.json(
          { error: 'This is the last active Administrator. Promote someone else first.' },
          { status: 400 },
        );
      }
    }

    const { data: roleId, error: roleError } = await getRoleIdByName(nextRole);
    if (roleError || !roleId) {
      return NextResponse.json({ error: `Unknown role '${nextRole}'.` }, { status: 400 });
    }

    const { error } = await updateTeamMember(id, { roleId });
    if (error) {
      return NextResponse.json({ error: 'Could not update the role.' }, { status: 500 });
    }

    const { data: updated } = await getTeamMemberById(id);
    return NextResponse.json({ data: updated });
  },
);
