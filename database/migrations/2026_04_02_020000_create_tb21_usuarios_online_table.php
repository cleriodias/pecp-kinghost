<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('tb21_usuarios_online', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('session_id', 255)->unique();
            $table->unsignedTinyInteger('active_role');
            $table->unsignedBigInteger('active_unit_id')->nullable();
            $table->timestamp('last_seen_at');
            $table->timestamps();

            $table->foreign('active_unit_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();

            $table->index('last_seen_at');
            $table->index(['user_id', 'last_seen_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb21_usuarios_online');
    }
};
