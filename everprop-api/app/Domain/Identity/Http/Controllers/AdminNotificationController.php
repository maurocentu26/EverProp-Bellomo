<?php

namespace App\Domain\Identity\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class AdminNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $page = $user->notifications()->orderByDesc('created_at')->orderByDesc('id')->simplePaginate(100);
        $notifications = $page->getCollection();
        $unreadCount = $user->unreadNotifications()->count();

        $data = $notifications->map(function ($n) use ($user) {
            $payload = $n->data;
            if (is_string($payload)) {
                $payload = json_decode($payload, true) ?: [];
            }

            return [
                'id' => $n->id,
                'targetUserId' => $user->public_id,
                'title' => $payload['title'] ?? 'Notificación',
                'message' => $payload['message'] ?? '',
                'leadId' => $payload['lead_id'] ?? null,
                'actionUrl' => $payload['action_url'] ?? null,
                'eventType' => $payload['event_type'] ?? null,
                'timestamp' => $n->created_at ? $n->created_at->toIso8601String() : now()->toIso8601String(),
                'read' => $n->read_at !== null,
            ];
        });

        return response()->json([
            'data' => $data,
            'meta' => [
                'unread_count' => $unreadCount,
                'next_page' => $page->hasMorePages() ? $page->currentPage() + 1 : null,
            ],
        ]);
    }

    public function count(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $unreadCount = $user->unreadNotifications()->count();
        $latest = $user->notifications()->latest()->first(['id', 'created_at']);

        $revisionRows = $user->notifications()->orderBy('id')->get(['id', 'read_at', 'updated_at']);
        return response()->json([
            'revision' => hash('sha256', $revisionRows->toJson()),
            'unread_count' => $unreadCount,
            'latest_id' => $latest?->id,
            'latest_timestamp' => $latest?->created_at?->toIso8601String(),
        ]);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $notification = $user->notifications()->where('id', $id)->first();
        abort_unless($notification, 404);
        $notification->markAsRead();

        return response()->json([
            'status' => 'marked_read',
            'id' => $id,
        ]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $user->unreadNotifications->markAsRead();

        return response()->json([
            'status' => 'all_marked_read',
        ]);
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        $user->notifications()->delete();

        return response()->json([
            'status' => 'all_deleted',
        ]);
    }
}

