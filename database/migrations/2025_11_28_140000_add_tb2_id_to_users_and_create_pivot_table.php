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
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('tb2_id')->default(1)->after('vr_cred');
            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnUpdate();
        });

        Schema::create('tb2_unidade_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('tb2_id');
            $table
                ->foreign('tb2_id')
                ->references('tb2_id')
                ->on('tb2_unidades')
                ->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'tb2_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tb2_unidade_user');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['tb2_id']);
            $table->dropColumn('tb2_id');
        });
    }
};
