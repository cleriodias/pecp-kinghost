<?php

namespace App\Models;

use App\Support\ManagementScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportTicket extends Model
{
    use HasFactory;

    public const STATUS_LABELS = [
        'aberto' => 'Aberto',
        'em_analise' => 'Em analise',
        'aguardando_usuario' => 'Aguardando usuario',
        'resolvido' => 'Resolvido',
        'fechado' => 'Fechado',
    ];

    public const MENU_STATUSES = [
        'aberto',
        'em_analise',
        'aguardando_usuario',
    ];

    protected $table = 'tb18_chamados';

    protected $fillable = [
        'user_id',
        'unit_id',
        'title',
        'description',
        'video_path',
        'video_original_name',
        'video_mime_type',
        'video_size',
        'status',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'unit_id' => 'integer',
        'video_size' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unidade::class, 'unit_id', 'tb2_id');
    }

    public function interactions(): HasMany
    {
        return $this->hasMany(SupportTicketInteraction::class);
    }

    public static function menuSummaryFor($user): array
    {
        $counts = collect(self::MENU_STATUSES)
            ->mapWithKeys(fn (string $status) => [$status => 0])
            ->all();

        if (! $user) {
            return [
                'can_view' => false,
                'counts' => $counts,
            ];
        }

        $isMaster = ManagementScope::isMaster($user);
        $query = self::query();

        if (! $isMaster) {
            $query->where('user_id', $user->id);
        }

        $resolvedCounts = $query
            ->selectRaw('status, COUNT(*) as total')
            ->whereIn('status', self::MENU_STATUSES)
            ->groupBy('status')
            ->pluck('total', 'status');

        foreach ($resolvedCounts as $status => $total) {
            $counts[$status] = (int) $total;
        }

        return [
            'can_view' => $isMaster || self::query()->where('user_id', $user->id)->exists(),
            'counts' => $counts,
        ];
    }
}
