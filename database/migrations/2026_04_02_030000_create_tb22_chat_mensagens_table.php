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
        Schema::create('tb22_chat_mensagens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sender_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->foreignId('recipient_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->unsignedTinyInteger('sender_role');
            $table->unsignedBigInteger('sender_unit_id')->nullable();
            $table->text('message');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->foreign('sender_unit_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->nullOnDelete();

            $table->index(['sender_id', 'recipient_id']);
            $table->index(['recipient_id', 'read_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb22_chat_mensagens');
    }
};
